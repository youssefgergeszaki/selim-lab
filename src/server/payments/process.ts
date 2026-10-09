import { processedCallbackString, verifyHmac } from "./paymob-hmac";

/**
 * Transaction-callback processing, written against small interfaces so the security-critical
 * logic (verification, matching, idempotency, state transitions) is unit-tested without a
 * network or database.
 */

export interface ParsedTransaction {
  id: string;
  amountCents: number;
  currency: string;
  success: boolean;
  pending: boolean;
  isVoided: boolean;
  isRefunded: boolean;
  integrationId: number | null;
  providerOrderId: string | null;
  merchantOrderId: string | null;
  message: string | null;
}

export interface PaymentAttempt {
  id: string;
  orderId: string;
  amountCents: number;
  currency: string;
  providerOrderId: string | null;
  specialReference: string | null;
}

export interface PaymentRepository {
  findAttempt(tx: { providerOrderId: string | null; specialReference: string | null }): Promise<PaymentAttempt | null>;
  /**
   * Inserts the event. Returns false if this event key was already processed to a final outcome
   * (duplicate). An earlier attempt that failed mid-way (no outcome / "error") may be retried —
   * the database transition itself is idempotent.
   */
  recordEvent(event: {
    eventKey: string;
    source: "webhook" | "redirect" | "inquiry";
    orderId: string | null;
    paymentId: string | null;
    transactionId: string;
    hmacValid: boolean;
    payload: Record<string, unknown>;
  }): Promise<boolean>;
  setEventOutcome(eventKey: string, outcome: string): Promise<void>;
  /** Applies the verified result atomically in the database (apply_payment_result). */
  applyResult(args: {
    paymentId: string;
    transactionId: string;
    success: boolean;
    pending: boolean;
    amountCents: number;
    currency: string;
    failureReason: string | null;
  }): Promise<string>;
  flagForReview(orderId: string, note: string): Promise<void>;
}

export interface TransactionLookup {
  /** Returns the transaction from the provider API, or null when lookups are not configured. */
  retrieve(transactionId: string): Promise<Record<string, unknown> | null>;
}

export type ProcessOutcome =
  | "invalid_signature"
  | "malformed"
  | "ignored_type"
  | "unknown_integration"
  | "unmatched"
  | "amount_mismatch"
  | "inquiry_mismatch"
  | "duplicate"
  | "refund_or_void_notice"
  | string; // database outcomes: paid, paid_on_hold, already_paid, pending, failed, ignored...

export interface ProcessResult {
  httpStatus: number;
  outcome: ProcessOutcome;
  orderId?: string;
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function toInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

/** Extracts the fields we rely on from a Paymob transaction object. */
export function parseTransaction(obj: Record<string, unknown>): ParsedTransaction | null {
  const id = toInt(obj.id);
  const amountCents = toInt(obj.amount_cents);
  const currency = typeof obj.currency === "string" ? obj.currency : null;
  if (id === null || amountCents === null || !currency) return null;
  const order = obj.order;
  let providerOrderId: string | null = null;
  let merchantOrderId: string | null = null;
  if (order && typeof order === "object") {
    const o = order as Record<string, unknown>;
    providerOrderId = o.id !== undefined && o.id !== null ? String(o.id) : null;
    merchantOrderId = typeof o.merchant_order_id === "string" ? o.merchant_order_id : null;
  } else if (order !== undefined && order !== null) {
    providerOrderId = String(order);
  }
  if (!merchantOrderId && typeof obj.merchant_order_id === "string") merchantOrderId = obj.merchant_order_id;
  const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
  return {
    id: String(id),
    amountCents,
    currency,
    success: bool(obj.success),
    pending: bool(obj.pending),
    isVoided: bool(obj.is_voided),
    isRefunded: bool(obj.is_refunded),
    integrationId: toInt(obj.integration_id),
    providerOrderId,
    merchantOrderId,
    message: typeof data.message === "string" ? data.message.slice(0, 200) : null,
  };
}

/** Keeps only non-sensitive fields of the payload for the audit trail (no card or customer data). */
export function sanitizeTransaction(tx: ParsedTransaction): Record<string, unknown> {
  return {
    id: tx.id,
    amount_cents: tx.amountCents,
    currency: tx.currency,
    success: tx.success,
    pending: tx.pending,
    is_voided: tx.isVoided,
    is_refunded: tx.isRefunded,
    integration_id: tx.integrationId,
    order_id: tx.providerOrderId,
    merchant_order_id: tx.merchantOrderId,
    message: tx.message,
  };
}

export function eventKey(tx: ParsedTransaction): string {
  const state = tx.isRefunded ? "refunded" : tx.isVoided ? "voided" : tx.pending ? "pending" : tx.success ? "success" : "failed";
  return `txn:${tx.id}:${state}`;
}

export interface ProcessInput {
  /** The `obj` from the callback body (webhook) or a transaction fetched from the API (inquiry). */
  transaction: Record<string, unknown>;
  /** `hmac` query parameter. Not required for `inquiry` (data fetched server-side from Paymob). */
  hmac: string | null;
  source: "webhook" | "redirect" | "inquiry";
  hmacSecret: string;
  allowedIntegrationIds: number[];
}

/**
 * Verifies and applies a Paymob transaction notification.
 * Never marks an order as paid unless the notification's HMAC is valid (or the data came
 * directly from Paymob's API), the attempt matches, and the amount and currency match.
 */
export async function processTransaction(
  input: ProcessInput,
  repo: PaymentRepository,
  lookup: TransactionLookup,
): Promise<ProcessResult> {
  const hmacValid =
    input.source === "inquiry" ? true : verifyHmac(processedCallbackString(input.transaction), input.hmac, input.hmacSecret);
  if (!hmacValid) return { httpStatus: 401, outcome: "invalid_signature" };

  const tx = parseTransaction(input.transaction);
  if (!tx) return { httpStatus: 400, outcome: "malformed" };

  if (tx.integrationId === null || !input.allowedIntegrationIds.includes(tx.integrationId)) {
    return { httpStatus: 200, outcome: "unknown_integration" };
  }

  const specialReference = tx.merchantOrderId;
  const attempt = await repo.findAttempt({ providerOrderId: tx.providerOrderId, specialReference });
  if (!attempt) return { httpStatus: 200, outcome: "unmatched" };

  const key = eventKey(tx);
  const inserted = await repo.recordEvent({
    eventKey: key,
    source: input.source,
    orderId: attempt.orderId,
    paymentId: attempt.id,
    transactionId: tx.id,
    hmacValid,
    payload: sanitizeTransaction(tx),
  });
  if (!inserted) return { httpStatus: 200, outcome: "duplicate", orderId: attempt.orderId };

  if (tx.amountCents !== attempt.amountCents || tx.currency !== attempt.currency) {
    await repo.flagForReview(attempt.orderId, `Paymob transaction ${tx.id}: amount/currency mismatch`);
    await repo.setEventOutcome(key, "amount_mismatch");
    return { httpStatus: 200, outcome: "amount_mismatch", orderId: attempt.orderId };
  }

  if (tx.isRefunded || tx.isVoided) {
    await repo.flagForReview(attempt.orderId, `Paymob reported ${tx.isRefunded ? "refund" : "void"} on transaction ${tx.id}`);
    await repo.setEventOutcome(key, "refund_or_void_notice");
    return { httpStatus: 200, outcome: "refund_or_void_notice", orderId: attempt.orderId };
  }

  // Defence in depth: before confirming a successful payment, confirm it with Paymob's API when
  // lookups are configured. A contradicting answer is rejected; an unavailable API falls back to
  // the HMAC-verified notification, which is Paymob's documented source of truth.
  if (tx.success && !tx.pending && input.source !== "inquiry") {
    try {
      const remote = await lookup.retrieve(tx.id);
      if (remote) {
        const confirmed = parseTransaction(remote);
        if (
          !confirmed ||
          !confirmed.success ||
          confirmed.pending ||
          confirmed.amountCents !== tx.amountCents ||
          confirmed.currency !== tx.currency
        ) {
          await repo.flagForReview(attempt.orderId, `Paymob inquiry did not confirm transaction ${tx.id}`);
          await repo.setEventOutcome(key, "inquiry_mismatch");
          return { httpStatus: 200, outcome: "inquiry_mismatch", orderId: attempt.orderId };
        }
      }
    } catch {
      // Lookup unavailable: proceed with the verified notification.
    }
  }

  let outcome: string;
  try {
    outcome = await repo.applyResult({
      paymentId: attempt.id,
      transactionId: tx.id,
      success: tx.success,
      pending: tx.pending,
      amountCents: tx.amountCents,
      currency: tx.currency,
      failureReason: tx.success ? null : tx.message ?? "declined",
    });
  } catch {
    // Leave the event retryable and ask the provider to redeliver.
    await repo.setEventOutcome(key, "error").catch(() => undefined);
    return { httpStatus: 500, outcome: "error", orderId: attempt.orderId };
  }
  await repo.setEventOutcome(key, outcome);
  return { httpStatus: 200, outcome, orderId: attempt.orderId };
}

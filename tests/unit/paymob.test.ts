import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  computeHmac,
  HMAC_FIELDS,
  processedCallbackString,
  redirectCallbackString,
  verifyHmac,
} from "@/server/payments/paymob-hmac";
import {
  eventKey,
  parseTransaction,
  processTransaction,
  type PaymentAttempt,
  type PaymentRepository,
  type TransactionLookup,
} from "@/server/payments/process";

// Test fixtures only — no live credentials are ever used in tests.
const SECRET = "test_hmac_secret_not_real";
const INTEGRATION = 4_000_001;

function transaction(over: Record<string, unknown> = {}) {
  return {
    id: 192036465,
    pending: false,
    amount_cents: 61000,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    is_3d_secure: true,
    integration_id: INTEGRATION,
    has_parent_transaction: false,
    order: { id: 217503754, merchant_order_id: "SL-261009-ABCDEF-1" },
    created_at: "2026-10-09T17:14:24.998346",
    currency: "EGP",
    error_occured: false,
    owner: 302852,
    data: { message: "Approved" },
    source_data: { pan: "2346", type: "card", sub_type: "MasterCard" },
    ...over,
  };
}

function signed(obj: Record<string, unknown>) {
  return computeHmac(processedCallbackString(obj), SECRET);
}

describe("Paymob HMAC", () => {
  it("concatenates the documented fields in order with lowercase booleans", () => {
    const str = processedCallbackString(transaction());
    expect(str).toBe(
      "61000" + "2026-10-09T17:14:24.998346" + "EGP" + "false" + "false" + "192036465" + String(INTEGRATION) +
        "true" + "false" + "false" + "false" + "true" + "false" + "217503754" + "302852" + "false" + "2346" +
        "MasterCard" + "card" + "true",
    );
    expect(HMAC_FIELDS).toHaveLength(20);
  });

  it("is HMAC-SHA512 hex keyed with the secret", () => {
    const str = processedCallbackString(transaction());
    expect(computeHmac(str, SECRET)).toBe(createHmac("sha512", SECRET).update(str).digest("hex"));
  });

  it("verifies valid signatures and rejects tampering, wrong secrets and malformed input", () => {
    const tx = transaction();
    const hmac = signed(tx);
    expect(verifyHmac(processedCallbackString(tx), hmac, SECRET)).toBe(true);
    expect(verifyHmac(processedCallbackString({ ...tx, amount_cents: 100 }), hmac, SECRET)).toBe(false);
    expect(verifyHmac(processedCallbackString({ ...tx, success: false }), hmac, SECRET)).toBe(false);
    expect(verifyHmac(processedCallbackString(tx), hmac, "other_secret")).toBe(false);
    expect(verifyHmac(processedCallbackString(tx), "deadbeef", SECRET)).toBe(false);
    expect(verifyHmac(processedCallbackString(tx), null, SECRET)).toBe(false);
    expect(verifyHmac(processedCallbackString(tx), hmac.toUpperCase(), SECRET)).toBe(true);
  });

  it("builds the same string from the redirect query parameters", () => {
    const tx = transaction();
    const query = new URLSearchParams({
      amount_cents: "61000",
      created_at: "2026-10-09T17:14:24.998346",
      currency: "EGP",
      error_occured: "false",
      has_parent_transaction: "false",
      id: "192036465",
      integration_id: String(INTEGRATION),
      is_3d_secure: "true",
      is_auth: "false",
      is_capture: "false",
      is_refunded: "false",
      is_standalone_payment: "true",
      is_voided: "false",
      order: "217503754",
      owner: "302852",
      pending: "false",
      "source_data.pan": "2346",
      "source_data.sub_type": "MasterCard",
      "source_data.type": "card",
      success: "true",
      merchant_order_id: "SL-261009-ABCDEF-1",
    });
    expect(redirectCallbackString(query)).toBe(processedCallbackString(tx));
  });
});

// ---------------------------------------------------------------------------
// Callback processing with an in-memory repository
// ---------------------------------------------------------------------------
function harness(opts: { attempt?: PaymentAttempt | null; remote?: Record<string, unknown> | null | "throw"; applyThrows?: boolean } = {}) {
  const attempt: PaymentAttempt | null =
    opts.attempt === undefined
      ? { id: "pay-1", orderId: "order-1", amountCents: 61000, currency: "EGP", providerOrderId: "217503754", specialReference: "SL-261009-ABCDEF-1" }
      : opts.attempt;
  const events = new Map<string, string | null>();
  const applied: unknown[] = [];
  const flagged: string[] = [];
  let paid = false;
  const repo: PaymentRepository = {
    findAttempt: vi.fn(async () => attempt),
    recordEvent: vi.fn(async (e) => {
      if (events.has(e.eventKey) && events.get(e.eventKey) && events.get(e.eventKey) !== "error") return false;
      events.set(e.eventKey, events.get(e.eventKey) ?? null);
      return true;
    }),
    setEventOutcome: vi.fn(async (key, outcome) => {
      events.set(key, outcome);
    }),
    applyResult: vi.fn(async (args) => {
      if (opts.applyThrows) throw new Error("db down");
      applied.push(args);
      if (args.success && !args.pending) {
        if (paid) return "already_paid";
        paid = true;
        return "paid";
      }
      return args.pending ? "pending" : "failed";
    }),
    flagForReview: vi.fn(async (_orderId, note) => {
      flagged.push(note);
    }),
  };
  const lookup: TransactionLookup = {
    retrieve: vi.fn(async () => {
      if (opts.remote === "throw") throw new Error("timeout");
      return opts.remote ?? null;
    }),
  };
  const run = (tx: Record<string, unknown>, hmac: string | null = signed(tx), source: "webhook" | "inquiry" = "webhook") =>
    processTransaction({ transaction: tx, hmac, source, hmacSecret: SECRET, allowedIntegrationIds: [INTEGRATION] }, repo, lookup);
  return { repo, lookup, run, applied, flagged, events };
}

describe("payment callback processing", () => {
  it("rejects invalid signatures without touching the order", async () => {
    const h = harness();
    const result = await h.run(transaction(), "0".repeat(128));
    expect(result).toMatchObject({ httpStatus: 401, outcome: "invalid_signature" });
    expect(h.repo.findAttempt).not.toHaveBeenCalled();
    expect(h.applied).toHaveLength(0);
  });

  it("never trusts a client-supplied success flag without a valid HMAC", async () => {
    const h = harness();
    const forged = transaction({ success: true });
    const result = await h.run(forged, signed(transaction({ success: false })));
    expect(result.outcome).toBe("invalid_signature");
    expect(h.applied).toHaveLength(0);
  });

  it("marks a verified, matching successful payment as paid", async () => {
    const h = harness();
    const result = await h.run(transaction());
    expect(result).toMatchObject({ httpStatus: 200, outcome: "paid", orderId: "order-1" });
    expect(h.applied).toEqual([
      expect.objectContaining({ paymentId: "pay-1", transactionId: "192036465", success: true, amountCents: 61000, currency: "EGP" }),
    ]);
  });

  it("processes duplicate notifications only once (idempotency)", async () => {
    const h = harness();
    const tx = transaction();
    await h.run(tx);
    const second = await h.run(tx);
    const third = await h.run(tx);
    expect(second.outcome).toBe("duplicate");
    expect(third.outcome).toBe("duplicate");
    expect(h.repo.applyResult).toHaveBeenCalledTimes(1);
  });

  it("rejects amount or currency mismatches and flags the order", async () => {
    const h = harness();
    const r1 = await h.run(transaction({ amount_cents: 100 }));
    expect(r1.outcome).toBe("amount_mismatch");
    const r2 = await h.run(transaction({ id: 2, currency: "USD" }));
    expect(r2.outcome).toBe("amount_mismatch");
    expect(h.applied).toHaveLength(0);
    expect(h.flagged).toHaveLength(2);
  });

  it("ignores transactions for other integrations and unknown orders", async () => {
    expect((await harness().run(transaction({ integration_id: 999 }))).outcome).toBe("unknown_integration");
    const h = harness({ attempt: null });
    expect((await h.run(transaction())).outcome).toBe("unmatched");
    expect(h.applied).toHaveLength(0);
  });

  it("records pending and failed payments without marking them paid", async () => {
    const h = harness();
    expect((await h.run(transaction({ pending: true, success: false }))).outcome).toBe("pending");
    expect((await h.run(transaction({ id: 3, success: false, error_occured: true, data: { message: "Do not honour" } }))).outcome).toBe("failed");
    expect(h.applied[1]).toMatchObject({ success: false, failureReason: "Do not honour" });
  });

  it("does not confirm payment when Paymob's API contradicts the notification", async () => {
    const h = harness({ remote: transaction({ success: false }) });
    const result = await h.run(transaction());
    expect(result.outcome).toBe("inquiry_mismatch");
    expect(h.applied).toHaveLength(0);
  });

  it("confirms with the verified notification when the lookup API is unavailable", async () => {
    const h = harness({ remote: "throw" });
    expect((await h.run(transaction())).outcome).toBe("paid");
  });

  it("flags refunds and voids for review instead of changing state", async () => {
    const h = harness();
    expect((await h.run(transaction({ is_refunded: true }))).outcome).toBe("refund_or_void_notice");
    expect(h.applied).toHaveLength(0);
  });

  it("asks the provider to retry when the database update fails, and allows the retry", async () => {
    const failing = harness({ applyThrows: true });
    const tx = transaction();
    const result = await failing.run(tx);
    expect(result).toMatchObject({ httpStatus: 500, outcome: "error" });
    expect(failing.events.get(eventKey(parseTransaction(tx)!))).toBe("error");
    // The same event may be re-delivered and is not treated as a duplicate.
    expect(await failing.repo.recordEvent({ eventKey: eventKey(parseTransaction(tx)!), source: "webhook", orderId: null, paymentId: null, transactionId: "1", hmacValid: true, payload: {} })).toBe(true);
  });

  it("parses order ids given as bare numbers", () => {
    expect(parseTransaction(transaction({ order: 55 }))?.providerOrderId).toBe("55");
    expect(parseTransaction({ id: "x" })).toBeNull();
  });
});

import "server-only";
import { toDecimalString, toPiasters } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { PaymentAttempt, PaymentRepository, TransactionLookup } from "./process";
import { retrieveTransaction } from "./paymob";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAttempt(row: any): PaymentAttempt {
  return {
    id: row.id,
    orderId: row.order_id,
    // Payment amounts are numeric(12,2) EGP; Paymob amounts are in cents (piasters).
    amountCents: toPiasters(row.amount),
    currency: String(row.currency).trim(),
    providerOrderId: row.provider_order_id,
    specialReference: row.special_reference,
  };
}

export const supabasePaymentRepository: PaymentRepository = {
  async findAttempt({ providerOrderId, specialReference }) {
    const db = createServiceClient();
    const columns = "id, order_id, amount, currency, provider_order_id, special_reference";
    if (providerOrderId) {
      const { data } = await db.from("payments").select(columns).eq("provider_order_id", providerOrderId).maybeSingle();
      if (data) return mapAttempt(data);
    }
    if (specialReference && /^SL-\d{6}-[A-Z0-9]{6}-\d{1,3}$/.test(specialReference)) {
      const { data } = await db.from("payments").select(columns).eq("special_reference", specialReference).maybeSingle();
      if (data) return mapAttempt(data);
    }
    return null;
  },

  async recordEvent(event) {
    const db = createServiceClient();
    const { error } = await db.from("payment_events").insert({
      provider: "paymob",
      event_key: event.eventKey,
      source: event.source,
      order_id: event.orderId,
      payment_id: event.paymentId,
      transaction_id: event.transactionId,
      hmac_valid: event.hmacValid,
      payload: event.payload,
    });
    if (!error) return true;
    if (error.code !== "23505") throw new Error(`payment_events insert: ${error.message}`);
    const { data } = await db
      .from("payment_events")
      .select("outcome")
      .eq("provider", "paymob")
      .eq("event_key", event.eventKey)
      .maybeSingle();
    // Retry only events that never reached a final outcome.
    return !data?.outcome || data.outcome === "error";
  },

  async setEventOutcome(eventKey, outcome) {
    await createServiceClient()
      .from("payment_events")
      .update({ outcome })
      .eq("provider", "paymob")
      .eq("event_key", eventKey);
  },

  async applyResult(args) {
    const { data, error } = await createServiceClient().rpc("apply_payment_result", {
      p_payment_id: args.paymentId,
      p_transaction_id: args.transactionId,
      p_success: args.success,
      p_pending: args.pending,
      p_amount: toDecimalString(args.amountCents),
      p_currency: args.currency,
      p_failure_reason: args.failureReason,
    });
    if (error) throw new Error(`apply_payment_result: ${error.message}`);
    return String(data);
  },

  async flagForReview(orderId, note) {
    const db = createServiceClient();
    const { data } = await db.from("orders").select("admin_note").eq("id", orderId).maybeSingle();
    const adminNote = [data?.admin_note, note].filter(Boolean).join("\n").slice(-4000);
    await db.from("orders").update({ needs_attention: true, admin_note: adminNote }).eq("id", orderId);
    logger.warn("payment.flagged", { orderId, note });
  },
};

export const paymobLookup: TransactionLookup = {
  retrieve: (transactionId) => retrieveTransaction(transactionId),
};

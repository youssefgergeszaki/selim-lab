import "server-only";
import { siteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toPiasters } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase/server";
import { toE164Egypt } from "@/lib/validation/common";
import { governorateName } from "@/lib/governorates";
import { createIntention, getPaymobConfig, unifiedCheckoutUrl, type PaymobMethod } from "./paymob";

export interface OrderForPayment {
  id: string;
  reference: string;
  locale: "ar" | "en";
  payment_method: string;
  payment_status: string;
  status: string;
  stock_state: string;
  total: string | number;
  email: string;
  phone: string;
  full_name: string;
  governorate: string;
  city: string;
  address_line: string;
  reservation_expires_at: string | null;
}

export const ORDER_PAYMENT_COLUMNS =
  "id, reference, locale, payment_method, payment_status, status, stock_state, total, email, phone, full_name, governorate, city, address_line, reservation_expires_at";

/** An online order can (re)start payment only while its stock is reserved and unpaid. */
export function canStartPayment(order: OrderForPayment, now = new Date()): boolean {
  return (
    (order.payment_method === "paymob_card" || order.payment_method === "paymob_wallet") &&
    (order.payment_status === "pending" || order.payment_status === "failed") &&
    order.status === "pending" &&
    order.stock_state === "reserved" &&
    !!order.reservation_expires_at &&
    new Date(order.reservation_expires_at).getTime() - now.getTime() > 60_000
  );
}

/**
 * Creates a new payment attempt and a Paymob intention for it. Returns the hosted checkout URL,
 * or null if the provider could not be reached (the order stays reserved and can be retried).
 */
export async function startPaymobPayment(order: OrderForPayment): Promise<string | null> {
  const config = getPaymobConfig();
  if (!config || !canStartPayment(order)) return null;
  const method = order.payment_method as PaymobMethod;
  const db = createServiceClient();

  const { data: last } = await db
    .from("payments")
    .select("attempt")
    .eq("order_id", order.id)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  const attempt = (last?.attempt ?? 0) + 1;
  if (attempt > 20) return null;
  const specialReference = `${order.reference}-${attempt}`;
  const amountCents = toPiasters(order.total);

  const { data: payment, error } = await db
    .from("payments")
    .insert({
      order_id: order.id,
      provider: "paymob",
      method,
      attempt,
      status: "initiated",
      amount: order.total,
      currency: "EGP",
      special_reference: specialReference,
      integration_id: String(config.integrationIds[method] ?? ""),
    })
    .select("id")
    .single();
  if (error || !payment) {
    logger.error("payment.attempt_insert_failed", { order: order.reference, code: error?.code });
    return null;
  }

  const [firstName, ...rest] = order.full_name.trim().split(/\s+/);
  const expiresInSeconds = Math.max(
    Math.floor((new Date(order.reservation_expires_at!).getTime() - Date.now()) / 1000),
    300,
  );
  try {
    const intention = await createIntention({
      amountCents,
      method,
      specialReference,
      orderReference: order.reference,
      itemName: `SELIM LAB ${order.reference}`,
      billing: {
        firstName,
        lastName: rest.join(" ") || firstName,
        email: order.email,
        phone: toE164Egypt(order.phone),
        city: order.city,
        state: governorateName(order.governorate, "en"),
        street: order.address_line,
      },
      notificationUrl: `${siteUrl()}/api/paymob/webhook`,
      redirectionUrl: `${siteUrl()}/api/paymob/return`,
      expirationSeconds: expiresInSeconds,
    });
    await db
      .from("payments")
      .update({
        intention_id: intention.intentionId,
        client_secret: intention.clientSecret,
        provider_order_id: intention.intentionOrderId,
        status: "pending",
      })
      .eq("id", payment.id);
    logger.info("payment.intention_created", { order: order.reference, attempt });
    return unifiedCheckoutUrl(intention.clientSecret, config);
  } catch (err) {
    logger.error("payment.intention_failed", { order: order.reference, attempt, error: String(err) });
    await db.from("payments").update({ status: "failed", failure_reason: "intention_failed" }).eq("id", payment.id);
    return null;
  }
}

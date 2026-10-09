import { NextResponse, type NextRequest } from "next/server";
import { localizePath } from "@/i18n/config";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/server";
import { configuredIntegrationIds, getPaymobConfig, retrieveTransaction } from "@/server/payments/paymob";
import { redirectCallbackString, verifyHmac } from "@/server/payments/paymob-hmac";
import { processTransaction } from "@/server/payments/process";
import { paymobLookup, supabasePaymentRepository } from "@/server/payments/repository";

export const dynamic = "force-dynamic";

const SPECIAL_REFERENCE_RE = /^(SL-\d{6}-[A-Z0-9]{6})-\d{1,3}$/;

/**
 * Customer returns here from Paymob (redirection URL). The query string is NEVER trusted to
 * mark an order as paid. If its HMAC is valid we reconcile by fetching the transaction from
 * Paymob's API server-side (when PAYMOB_API_KEY is configured); the webhook remains the
 * primary source of truth. The customer is then sent to their order page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const home = new URL(localizePath("ar", "/"), request.url);
  const config = getPaymobConfig();
  if (!config || !isServiceRoleConfigured()) return NextResponse.redirect(home, 303);

  const merchantOrderId = params.get("merchant_order_id") ?? "";
  const providerOrderId = params.get("order") ?? "";
  const db = createServiceClient();

  // Locate the order through our own payment attempt records.
  let orderId: string | null = null;
  const match = SPECIAL_REFERENCE_RE.exec(merchantOrderId);
  if (match) {
    const { data } = await db.from("payments").select("order_id").eq("special_reference", merchantOrderId).maybeSingle();
    orderId = data?.order_id ?? null;
  } else if (/^\d{1,20}$/.test(providerOrderId)) {
    const { data } = await db.from("payments").select("order_id").eq("provider_order_id", providerOrderId).maybeSingle();
    orderId = data?.order_id ?? null;
  }
  if (!orderId) return NextResponse.redirect(home, 303);

  const { data: order } = await db.from("orders").select("reference, locale, payment_status").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.redirect(home, 303);
  const target = new URL(localizePath(order.locale === "en" ? "en" : "ar", `/order/${order.reference}`), request.url);

  const hmacValid = verifyHmac(redirectCallbackString(params), params.get("hmac"), config.hmacSecret);
  const transactionId = params.get("id");
  if (hmacValid && transactionId && /^\d{1,20}$/.test(transactionId) && order.payment_status !== "paid") {
    try {
      const remote = await retrieveTransaction(transactionId, config);
      if (remote) {
        const result = await processTransaction(
          {
            transaction: remote,
            hmac: null,
            source: "inquiry",
            hmacSecret: config.hmacSecret,
            allowedIntegrationIds: configuredIntegrationIds(config),
          },
          supabasePaymentRepository,
          paymobLookup,
        );
        logger.info("paymob.return_reconciled", { outcome: result.outcome });
      }
    } catch (error) {
      // Reconciliation is best-effort; the webhook will update the order.
      logger.warn("paymob.return_reconcile_failed", { error: String(error) });
    }
  } else if (!hmacValid) {
    logger.warn("paymob.return_invalid_hmac");
  }

  return NextResponse.redirect(target, 303);
}

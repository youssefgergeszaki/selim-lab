import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { configuredIntegrationIds, getPaymobConfig } from "@/server/payments/paymob";
import { processTransaction } from "@/server/payments/process";
import { paymobLookup, supabasePaymentRepository } from "@/server/payments/repository";
import { TAGS } from "@/server/cache";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;

/**
 * Paymob "transaction processed" callback (server-to-server).
 * Configure as the notification URL: https://<domain>/api/paymob/webhook
 */
export async function POST(request: NextRequest) {
  const config = getPaymobConfig();
  if (!config || !isServiceRoleConfigured()) {
    logger.error("paymob.webhook_not_configured");
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ ok: false }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payload = body as { type?: unknown; obj?: unknown };
  if (payload?.type !== "TRANSACTION") {
    // Other callback types (e.g. TOKEN) are acknowledged but not used.
    return NextResponse.json({ ok: true, outcome: "ignored_type" });
  }
  if (!payload.obj || typeof payload.obj !== "object") return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const result = await processTransaction(
      {
        transaction: payload.obj as Record<string, unknown>,
        hmac: request.nextUrl.searchParams.get("hmac"),
        source: "webhook",
        hmacSecret: config.hmacSecret,
        allowedIntegrationIds: configuredIntegrationIds(config),
      },
      supabasePaymentRepository,
      paymobLookup,
    );
    logger.info("paymob.webhook", { outcome: result.outcome, orderId: result.orderId ?? null });
    if (result.outcome === "paid" || result.outcome === "paid_on_hold") {
      // Stock and best-seller counts changed.
      revalidateTag(TAGS.catalog, "max");
    }
    return NextResponse.json({ ok: result.httpStatus < 400, outcome: result.outcome }, { status: result.httpStatus });
  } catch (error) {
    logger.error("paymob.webhook_failed", { error: String(error) });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

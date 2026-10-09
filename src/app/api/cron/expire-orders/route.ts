import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/security/tokens";
import { createServiceClient } from "@/lib/supabase/server";
import { TAGS } from "@/server/cache";

export const dynamic = "force-dynamic";

/**
 * Scheduled maintenance (Vercel Cron, see vercel.json). Vercel sends
 * `Authorization: Bearer <CRON_SECRET>`.
 * - Expires unpaid online orders whose reservation window has passed and releases their stock.
 * - Prunes stale rate-limit windows and abandoned guest carts.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (!isServiceRoleConfigured()) return NextResponse.json({ ok: false }, { status: 503 });

  const db = createServiceClient();
  const { data: expired, error } = await db.rpc("expire_stale_orders");
  if (error) {
    logger.error("cron.expire_failed", { message: error.message });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const staleCarts = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
  await db.from("rate_limits").delete().lt("window_start", dayAgo);
  await db.from("carts").delete().is("user_id", null).lt("updated_at", staleCarts);

  if ((expired as number) > 0) revalidateTag(TAGS.catalog, "max");
  logger.info("cron.expire_orders", { expired });
  return NextResponse.json({ ok: true, expired });
}

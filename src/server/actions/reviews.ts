"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { cleanText } from "@/lib/validation/common";

export type ReviewState = { status: "idle" | "submitted" | "signin" | "invalid" | "duplicate" | "error" | "rate_limited" };

const schema = z.object({
  productId: z.uuid(),
  locale: z.enum(["ar", "en"]),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().max(120).transform(cleanText).optional(),
  body: z.string().min(3).max(2000).transform(cleanText),
});

/**
 * Reviews are submitted by signed-in customers only and published after moderation,
 * so the storefront only ever shows genuine reviews.
 */
export async function submitReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const user = await getSessionUser();
  if (!user) return { status: "signin" };
  const parsed = schema.safeParse({
    productId: formData.get("productId"),
    locale: formData.get("locale"),
    rating: formData.get("rating"),
    title: formData.get("title") || undefined,
    body: formData.get("body"),
  });
  if (!parsed.success || parsed.data.body.length < 3) return { status: "invalid" };
  if (!isServiceRoleConfigured()) return { status: "error" };
  if (!(await rateLimit(RATE_LIMITS.review, user.id))) return { status: "rate_limited" };

  const db = createServiceClient();
  const [{ data: profile }, { data: purchases }] = await Promise.all([
    db.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    db
      .from("order_items")
      .select("id, orders!inner(user_id, payment_status, status)")
      .eq("product_id", parsed.data.productId)
      .eq("orders.user_id", user.id)
      .in("orders.status", ["confirmed", "processing", "shipped", "delivered"])
      .limit(1),
  ]);
  const first = (profile?.full_name ?? user.fullName ?? "").trim().split(/\s+/)[0];
  const displayName = (first || (parsed.data.locale === "ar" ? "عميل" : "Customer")).slice(0, 60);

  const { error } = await db.from("reviews").insert({
    product_id: parsed.data.productId,
    user_id: user.id,
    display_name: displayName,
    rating: parsed.data.rating,
    title: parsed.data.title || null,
    body: parsed.data.body,
    locale: parsed.data.locale,
    status: "pending",
    verified_purchase: (purchases ?? []).length > 0,
  });
  if (error) {
    if (error.code === "23505") return { status: "duplicate" };
    logger.error("review.insert_failed", { code: error.code });
    return { status: "error" };
  }
  return { status: "submitted" };
}

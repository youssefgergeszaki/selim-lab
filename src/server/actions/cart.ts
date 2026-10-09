"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizeCouponCode, validateCoupon } from "@/lib/commerce/coupons";
import { getSessionUser } from "@/lib/auth";
import { computeSubtotal } from "@/lib/commerce/pricing";
import {
  countCustomerRedemptions,
  findCurrentCart,
  getCartView,
  getOrCreateCart,
  loadCoupon,
  MAX_LINE_QUANTITY,
} from "@/server/cart";

export type CartActionResult =
  | { ok: true; count?: number }
  | { ok: false; error: "invalid" | "unavailable" | "insufficient" | "rate_limited" | "not_configured" | "server"; available?: number };

const addSchema = z.object({
  variantId: z.uuid(),
  quantity: z.coerce.number().int().min(1).max(MAX_LINE_QUANTITY),
});

/** Adds a variant to the cart. Price is never accepted from the client. */
export async function addToCart(input: { variantId: string; quantity: number }): Promise<CartActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!isServiceRoleConfigured()) return { ok: false, error: "not_configured" };
  if (!(await rateLimit(RATE_LIMITS.cart))) return { ok: false, error: "rate_limited" };

  try {
    const db = createServiceClient();
    const { data: variant } = await db
      .from("product_variants")
      .select("id, is_active, stock_quantity, reserved_quantity, products!inner(status)")
      .eq("id", parsed.data.variantId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const status = (variant?.products as any)?.status;
    if (!variant || !variant.is_active || status !== "published") return { ok: false, error: "unavailable" };
    const available = Math.max(variant.stock_quantity - variant.reserved_quantity, 0);

    const cart = await getOrCreateCart();
    const { data: existing } = await db
      .from("cart_items")
      .select("id, quantity")
      .eq("cart_id", cart.id)
      .eq("variant_id", variant.id)
      .maybeSingle();
    const desired = Math.min((existing?.quantity ?? 0) + parsed.data.quantity, MAX_LINE_QUANTITY);
    if (available <= 0) return { ok: false, error: "unavailable" };
    if (desired > available) return { ok: false, error: "insufficient", available };

    const { error } = await db
      .from("cart_items")
      .upsert({ cart_id: cart.id, variant_id: variant.id, quantity: desired }, { onConflict: "cart_id,variant_id" });
    if (error) throw error;
    await db.from("carts").update({ updated_at: new Date().toISOString() }).eq("id", cart.id);

    const { data: items } = await db.from("cart_items").select("quantity").eq("cart_id", cart.id);
    revalidatePath("/[locale]", "layout");
    return { ok: true, count: (items ?? []).reduce((n, i) => n + i.quantity, 0) };
  } catch (error) {
    logger.error("cart.add_failed", { error: String(error) });
    return { ok: false, error: "server" };
  }
}

const updateSchema = z.object({
  itemId: z.uuid(),
  quantity: z.coerce.number().int().min(0).max(MAX_LINE_QUANTITY),
});

/** Updates a line quantity (0 removes). Only lines of the visitor's own cart can be changed. */
export async function updateCartItem(formData: FormData): Promise<void> {
  const parsed = updateSchema.safeParse({ itemId: formData.get("itemId"), quantity: formData.get("quantity") });
  if (!parsed.success || !isServiceRoleConfigured()) return;
  const cart = await findCurrentCart();
  if (!cart) return;
  const db = createServiceClient();
  if (parsed.data.quantity === 0) {
    await db.from("cart_items").delete().eq("id", parsed.data.itemId).eq("cart_id", cart.id);
  } else {
    await db
      .from("cart_items")
      .update({ quantity: parsed.data.quantity })
      .eq("id", parsed.data.itemId)
      .eq("cart_id", cart.id);
  }
  revalidatePath("/[locale]", "layout");
}

export async function removeCartItem(formData: FormData): Promise<void> {
  formData.set("quantity", "0");
  await updateCartItem(formData);
}

export type CouponActionState = { status: "idle" | "applied" | "removed" | "error"; reason?: string; minSubtotal?: number };

export async function applyCoupon(_prev: CouponActionState, formData: FormData): Promise<CouponActionState> {
  if (!isServiceRoleConfigured()) return { status: "error", reason: "notFound" };
  if (!(await rateLimit(RATE_LIMITS.coupon))) return { status: "error", reason: "rate_limited" };
  const code = normalizeCouponCode(String(formData.get("code") ?? ""));
  if (!code) return { status: "error", reason: "notFound" };
  const cart = await findCurrentCart();
  if (!cart) return { status: "error", reason: "notFound" };

  const view = await getCartView("en", cart);
  const subtotal = computeSubtotal(
    view.lines.filter((l) => l.purchasable).map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })),
  );
  const record = await loadCoupon(code);
  const user = await getSessionUser();
  const redemptions = record && user ? await countCustomerRedemptions(record.id, { userId: user.id, email: user.email }) : 0;
  const result = validateCoupon(record, { subtotal, customerRedemptions: redemptions });
  if (!result.ok) return { status: "error", reason: result.reason, minSubtotal: result.minSubtotal };

  await createServiceClient().from("carts").update({ coupon_code: code }).eq("id", cart.id);
  revalidatePath("/[locale]", "layout");
  return { status: "applied" };
}

export async function removeCoupon(): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  const cart = await findCurrentCart();
  if (!cart) return;
  await createServiceClient().from("carts").update({ coupon_code: null }).eq("id", cart.id);
  revalidatePath("/[locale]", "layout");
}

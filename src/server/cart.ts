import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/config";
import { getSessionUser } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { toPiasters, type Piasters } from "@/lib/money";
import { randomToken, sha256 } from "@/lib/security/tokens";
import { storageUrl } from "@/lib/storage";
import { createServiceClient } from "@/lib/supabase/server";
import { computeTotals, type AppliedCoupon, type Totals } from "@/lib/commerce/pricing";
import { validateCoupon, type CouponRecord, type CouponRejection } from "@/lib/commerce/coupons";
import { lowestShippingFee } from "@/lib/commerce/shipping";
import { getShippingConfig } from "./content";

export const CART_COOKIE = "sl_cart";
const CART_MAX_AGE = 60 * 60 * 24 * 60; // 60 days
export const MAX_LINE_QUANTITY = 10;

interface CartRow {
  id: string;
  user_id: string | null;
  token_hash: string | null;
  coupon_code: string | null;
}

async function readCartToken(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(CART_COOKIE)?.value;
  return token && /^[A-Za-z0-9_-]{40,60}$/.test(token) ? token : null;
}

/** Finds the current visitor's cart (user cart for signed-in customers, cookie cart for guests). */
export async function findCurrentCart(): Promise<CartRow | null> {
  if (!isServiceRoleConfigured()) return null;
  const db = createServiceClient();
  const user = await getSessionUser();
  if (user) {
    const { data } = await db.from("carts").select("id, user_id, token_hash, coupon_code").eq("user_id", user.id).maybeSingle();
    if (data) return data;
  }
  const token = await readCartToken();
  if (!token) return null;
  const { data } = await db
    .from("carts")
    .select("id, user_id, token_hash, coupon_code")
    .eq("token_hash", sha256(token))
    .is("user_id", null)
    .maybeSingle();
  return data ?? null;
}

/** Finds or creates the visitor's cart. Only callable where cookies can be written (actions). */
export async function getOrCreateCart(): Promise<CartRow> {
  const existing = await findCurrentCart();
  if (existing) return existing;
  const db = createServiceClient();
  const user = await getSessionUser();
  if (user) {
    const { data, error } = await db
      .from("carts")
      .upsert({ user_id: user.id }, { onConflict: "user_id" })
      .select("id, user_id, token_hash, coupon_code")
      .single();
    if (error) throw new Error(`cart create: ${error.message}`);
    return data;
  }
  const token = randomToken(32);
  const { data, error } = await db
    .from("carts")
    .insert({ token_hash: sha256(token) })
    .select("id, user_id, token_hash, coupon_code")
    .single();
  if (error) throw new Error(`cart create: ${error.message}`);
  const store = await cookies();
  store.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_MAX_AGE,
  });
  return data;
}

/** After sign-in: move guest cart lines into the user's cart, then delete the guest cart. */
export async function mergeGuestCart(userId: string): Promise<void> {
  if (!isServiceRoleConfigured()) return;
  const token = await readCartToken();
  if (!token) return;
  const db = createServiceClient();
  const { data: guest } = await db
    .from("carts")
    .select("id, coupon_code")
    .eq("token_hash", sha256(token))
    .is("user_id", null)
    .maybeSingle();
  if (!guest) return;

  const { data: userCart, error } = await db
    .from("carts")
    .upsert({ user_id: userId }, { onConflict: "user_id" })
    .select("id, coupon_code")
    .single();
  if (error || !userCart) return;

  const [{ data: guestItems }, { data: userItems }] = await Promise.all([
    db.from("cart_items").select("variant_id, quantity").eq("cart_id", guest.id),
    db.from("cart_items").select("variant_id, quantity").eq("cart_id", userCart.id),
  ]);
  const merged = new Map<string, number>();
  for (const item of userItems ?? []) merged.set(item.variant_id, item.quantity);
  for (const item of guestItems ?? []) {
    merged.set(item.variant_id, Math.min((merged.get(item.variant_id) ?? 0) + item.quantity, MAX_LINE_QUANTITY));
  }
  if (merged.size > 0) {
    await db.from("cart_items").upsert(
      [...merged.entries()].map(([variant_id, quantity]) => ({ cart_id: userCart.id, variant_id, quantity })),
      { onConflict: "cart_id,variant_id" },
    );
  }
  if (!userCart.coupon_code && guest.coupon_code) {
    await db.from("carts").update({ coupon_code: guest.coupon_code }).eq("id", userCart.id);
  }
  await db.from("carts").delete().eq("id", guest.id);
  (await cookies()).delete(CART_COOKIE);
}

// ---------------------------------------------------------------------------
// Cart view
// ---------------------------------------------------------------------------

export interface CartLine {
  itemId: string;
  variantId: string;
  productId: string;
  slug: string | null;
  name: string;
  variantName: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: Piasters;
  compareAtPrice: Piasters | null;
  quantity: number;
  available: number;
  /** Unavailable lines (inactive/unpublished/out of stock) are excluded from totals and checkout. */
  purchasable: boolean;
  lineTotal: Piasters;
}

export interface CartView {
  id: string | null;
  lines: CartLine[];
  itemCount: number;
  couponCode: string | null;
  coupon: AppliedCoupon | null;
  couponError: CouponRejection | null;
  couponMinSubtotal: Piasters | null;
  totals: Totals;
  shippingFrom: Piasters | null;
  hasIssues: boolean;
}

const emptyTotals: Totals = {
  subtotal: 0,
  discount: 0,
  lineDiscounts: [],
  shippingFee: 0,
  shippingWaived: false,
  codFee: 0,
  total: 0,
};

export function emptyCart(): CartView {
  return {
    id: null,
    lines: [],
    itemCount: 0,
    couponCode: null,
    coupon: null,
    couponError: null,
    couponMinSubtotal: null,
    totals: emptyTotals,
    shippingFrom: null,
    hasIssues: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapCoupon(row: any): CouponRecord {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discount_type,
    value: row.discount_type === "fixed" ? toPiasters(row.value) : Number(row.value),
    minSubtotal: toPiasters(row.min_subtotal),
    maxDiscount: row.max_discount === null ? null : toPiasters(row.max_discount),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    usageLimit: row.usage_limit,
    usageCount: row.usage_count,
    perCustomerLimit: row.per_customer_limit,
    isActive: row.is_active,
  };
}

export async function loadCoupon(code: string): Promise<CouponRecord | null> {
  const { data } = await createServiceClient().from("coupons").select("*").eq("code", code).maybeSingle();
  return data ? mapCoupon(data) : null;
}

export async function countCustomerRedemptions(
  couponId: string,
  identity: { email?: string | null; userId?: string | null },
): Promise<number> {
  const filters: string[] = [];
  if (identity.email) filters.push(`email.eq.${identity.email.toLowerCase().replace(/[,()]/g, "")}`);
  if (identity.userId) filters.push(`user_id.eq.${identity.userId}`);
  if (filters.length === 0) return 0;
  const { count } = await createServiceClient()
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId)
    .is("released_at", null)
    .or(filters.join(","));
  return count ?? 0;
}

/** Loads the cart with live prices and stock from the database. */
export async function getCartView(locale: Locale, cart?: CartRow | null): Promise<CartView> {
  const current = cart === undefined ? await findCurrentCart() : cart;
  if (!current) return emptyCart();
  const db = createServiceClient();

  const { data: items, error } = await db
    .from("cart_items")
    .select(
      `id, quantity, variant_id,
       product_variants!inner (
         id, sku, name_ar, name_en, price, compare_at_price, stock_quantity, reserved_quantity, is_active, product_id,
         products!inner ( id, status, product_translations ( locale, name, slug ), product_images ( storage_path, sort_order ) )
       )`,
    )
    .eq("cart_id", current.id)
    .order("created_at");
  if (error) throw new Error(`cart items: ${error.message}`);

  const lines: CartLine[] = (items ?? []).map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v = item.product_variants as any;
    const product = v.products;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const translations = (product.product_translations ?? []) as any[];
    const tr = translations.find((t) => t.locale === locale) ?? translations[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const images = [...((product.product_images ?? []) as any[])].sort((a, b) => a.sort_order - b.sort_order);
    const available = Math.max(v.stock_quantity - v.reserved_quantity, 0);
    const unitPrice = toPiasters(v.price);
    const compare = v.compare_at_price === null ? null : toPiasters(v.compare_at_price);
    const purchasable = v.is_active && product.status === "published" && available >= item.quantity;
    return {
      itemId: item.id,
      variantId: v.id,
      productId: product.id,
      slug: tr?.slug ?? null,
      name: tr?.name ?? v.sku,
      variantName: (locale === "ar" ? v.name_ar : v.name_en) || v.name_en || null,
      sku: v.sku,
      imageUrl: storageUrl("product-images", images[0]?.storage_path),
      unitPrice,
      compareAtPrice: compare !== null && compare > unitPrice ? compare : null,
      quantity: item.quantity,
      available: v.is_active && product.status === "published" ? available : 0,
      purchasable,
      lineTotal: unitPrice * item.quantity,
    };
  });

  const purchasable = lines.filter((l) => l.purchasable);
  const subtotalLines = purchasable.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice }));
  const baseTotals = computeTotals({ lines: subtotalLines });

  let coupon: AppliedCoupon | null = null;
  let couponError: CouponRejection | null = null;
  let couponMinSubtotal: Piasters | null = null;
  if (current.coupon_code) {
    const record = await loadCoupon(current.coupon_code);
    const user = await getSessionUser();
    const redemptions = record && user ? await countCustomerRedemptions(record.id, { userId: user.id, email: user.email }) : 0;
    const result = validateCoupon(record, { subtotal: baseTotals.subtotal, customerRedemptions: redemptions });
    if (result.ok) coupon = result.coupon;
    else {
      couponError = result.reason;
      couponMinSubtotal = result.minSubtotal ?? null;
    }
  }

  const totals = computeTotals({ lines: subtotalLines, coupon });
  const shipping = await getShippingConfig();

  return {
    id: current.id,
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    couponCode: current.coupon_code,
    coupon,
    couponError,
    couponMinSubtotal,
    totals,
    shippingFrom: lowestShippingFee(shipping.rates),
    hasIssues: lines.some((l) => !l.purchasable),
  };
}

/** Cheap item count for the header badge. */
export async function getCartCount(): Promise<number> {
  try {
    const cart = await findCurrentCart();
    if (!cart) return 0;
    const { data } = await createServiceClient().from("cart_items").select("quantity").eq("cart_id", cart.id);
    return (data ?? []).reduce((n, row) => n + row.quantity, 0);
  } catch {
    return 0;
  }
}

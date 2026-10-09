import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "@/i18n/config";
import { logger } from "@/lib/logger";
import { toDecimalString, toPiasters, type Piasters } from "@/lib/money";
import { generateOrderReference, randomToken, sha256 } from "@/lib/security/tokens";
import { createServiceClient } from "@/lib/supabase/server";
import { computeTotals, type AppliedCoupon, type Totals } from "@/lib/commerce/pricing";
import { validateCoupon, type CouponRejection } from "@/lib/commerce/coupons";
import { availableShippingOptions, type ShippingOption } from "@/lib/commerce/shipping";
import { getPaymobConfig, isPaymobMethodConfigured } from "./payments/paymob";
import { countCustomerRedemptions, getCartView, loadCoupon, findCurrentCart, type CartLine } from "./cart";
import { mapRate, mapZone, type StoreSettings, parseSocial } from "./content";

export type PaymentMethod = "paymob_card" | "paymob_wallet" | "cod";

export const ORDER_TOKEN_COOKIE_PREFIX = "sl_ot_";

/** Fresh (uncached) settings for checkout decisions. */
export async function loadSettingsFresh(): Promise<StoreSettings> {
  const { data, error } = await createServiceClient().from("store_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error("settings unavailable");
  return {
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    whatsapp: data.whatsapp,
    addressAr: data.address_ar,
    addressEn: data.address_en,
    social: parseSocial(data.social),
    announcementAr: data.announcement_ar,
    announcementEn: data.announcement_en,
    announcementActive: data.announcement_active,
    codEnabled: data.cod_enabled,
    codFee: toPiasters(data.cod_fee),
    codMaxTotal: data.cod_max_total === null ? null : toPiasters(data.cod_max_total),
    paymobCardEnabled: data.paymob_card_enabled,
    paymobWalletEnabled: data.paymob_wallet_enabled,
    reservationMinutes: data.reservation_minutes,
    lowStockThreshold: data.low_stock_threshold,
  };
}

export async function loadShippingFresh() {
  const db = createServiceClient();
  const [zones, rates] = await Promise.all([
    db.from("shipping_zones").select("*").eq("is_active", true),
    db.from("shipping_rates").select("*").eq("is_active", true),
  ]);
  if (zones.error || rates.error) throw new Error("shipping unavailable");
  return { zones: (zones.data ?? []).map(mapZone), rates: (rates.data ?? []).map(mapRate) };
}

/** Payment methods that are both enabled by the administrator and configured on the server. */
export function enabledPaymentMethods(settings: StoreSettings): PaymentMethod[] {
  const config = getPaymobConfig();
  const methods: PaymentMethod[] = [];
  if (settings.paymobCardEnabled && isPaymobMethodConfigured("paymob_card", config)) methods.push("paymob_card");
  if (settings.paymobWalletEnabled && isPaymobMethodConfigured("paymob_wallet", config)) methods.push("paymob_wallet");
  if (settings.codEnabled) methods.push("cod");
  return methods;
}

export type CheckoutErrorCode =
  | "empty_cart"
  | "out_of_stock"
  | "price_changed"
  | "coupon_invalid"
  | "coupon_exhausted"
  | "shipping_unavailable"
  | "payment_unavailable"
  | "validation"
  | "rate_limited"
  | "server";

export class CheckoutError extends Error {
  constructor(
    readonly code: CheckoutErrorCode,
    readonly detail?: string,
  ) {
    super(code);
    this.name = "CheckoutError";
  }
}

export interface CheckoutQuote {
  lines: CartLine[];
  coupon: AppliedCoupon | null;
  couponError: CouponRejection | null;
  shipping: ShippingOption;
  totals: Totals;
}

/**
 * Server-side pricing from trusted database records. Browser input is limited to which
 * shipping rate, payment method and coupon code to use.
 */
export async function buildQuote(params: {
  locale: Locale;
  governorate: string;
  shippingRateId: string;
  paymentMethod: PaymentMethod;
  email: string;
  userId: string | null;
  settings: StoreSettings;
}): Promise<CheckoutQuote> {
  const cart = await findCurrentCart();
  if (!cart) throw new CheckoutError("empty_cart");
  const view = await getCartView(params.locale, cart);
  if (view.lines.length === 0) throw new CheckoutError("empty_cart");
  if (view.lines.some((l) => !l.purchasable)) throw new CheckoutError("out_of_stock");

  const pricedLines = view.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice }));
  const base = computeTotals({ lines: pricedLines });

  let coupon: AppliedCoupon | null = null;
  let couponError: CouponRejection | null = null;
  if (cart.coupon_code) {
    const record = await loadCoupon(cart.coupon_code);
    const redemptions = record ? await countCustomerRedemptions(record.id, { email: params.email, userId: params.userId }) : 0;
    const result = validateCoupon(record, { subtotal: base.subtotal, customerRedemptions: redemptions });
    if (result.ok) coupon = result.coupon;
    else couponError = result.reason;
  }

  const shippingConfig = await loadShippingFresh();
  const discounted = computeTotals({ lines: pricedLines, coupon });
  const options = availableShippingOptions(
    shippingConfig.zones,
    shippingConfig.rates,
    params.governorate,
    discounted.subtotal - discounted.discount,
  );
  const shipping = options.find((o) => o.id === params.shippingRateId);
  if (!shipping) throw new CheckoutError("shipping_unavailable");

  const codFee: Piasters = params.paymentMethod === "cod" ? params.settings.codFee : 0;
  const totals = computeTotals({
    lines: pricedLines,
    coupon,
    shipping: { rateId: shipping.id, fee: shipping.fee, freeShippingThreshold: shipping.freeShippingThreshold },
    codFee,
  });
  return { lines: view.lines, coupon, couponError, shipping, totals };
}

export interface PlaceOrderInput {
  idempotencyKey: string;
  locale: Locale;
  userId: string | null;
  fullName: string;
  email: string;
  phone: string;
  governorate: string;
  city: string;
  addressLine: string;
  notes?: string;
  shippingRateId: string;
  paymentMethod: PaymentMethod;
}

export interface PlacedOrder {
  orderId: string;
  reference: string;
  accessToken: string | null;
  duplicate: boolean;
}

const DB_ERROR_MAP: Record<string, CheckoutErrorCode> = {
  SL_EMPTY_CART: "empty_cart",
  SL_OUT_OF_STOCK: "out_of_stock",
  SL_INVALID_QUANTITY: "out_of_stock",
  SL_PRICE_CHANGED: "price_changed",
  SL_TOTAL_MISMATCH: "price_changed",
  SL_COUPON_INVALID: "coupon_invalid",
  SL_COUPON_EXHAUSTED: "coupon_exhausted",
  SL_SHIPPING_UNAVAILABLE: "shipping_unavailable",
};

export function mapDatabaseError(message: string | undefined): CheckoutErrorCode {
  const match = message?.match(/SL_[A-Z_]+/)?.[0];
  return (match && DB_ERROR_MAP[match]) || "server";
}

/**
 * Creates the order atomically (prices re-verified and stock reserved under row locks in
 * place_order). Returns the order and a one-time guest access token.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const db = createServiceClient();
  const settings = await loadSettingsFresh();
  if (!enabledPaymentMethods(settings).includes(input.paymentMethod)) {
    throw new CheckoutError("payment_unavailable");
  }

  // Release expired reservations first so their stock is available to this checkout.
  await db.rpc("expire_stale_orders").then(
    () => undefined,
    () => undefined,
  );

  const quote = await buildQuote({
    locale: input.locale,
    governorate: input.governorate,
    shippingRateId: input.shippingRateId,
    paymentMethod: input.paymentMethod,
    email: input.email,
    userId: input.userId,
    settings,
  });
  if (quote.couponError) {
    throw new CheckoutError(quote.couponError === "usageLimit" || quote.couponError === "perCustomerLimit" ? "coupon_exhausted" : "coupon_invalid");
  }
  if (input.paymentMethod === "cod" && settings.codMaxTotal !== null && quote.totals.total > settings.codMaxTotal) {
    throw new CheckoutError("payment_unavailable", "cod_max_total");
  }
  if (input.paymentMethod !== "cod" && quote.totals.total <= 0) {
    throw new CheckoutError("payment_unavailable", "zero_total");
  }

  const accessToken = randomToken(32);
  const reference = generateOrderReference();
  const shippingName = input.locale === "ar" ? quote.shipping.nameAr : quote.shipping.nameEn;
  const payload = {
    reference,
    access_token_hash: sha256(accessToken),
    idempotency_key: input.idempotencyKey,
    user_id: input.userId,
    locale: input.locale,
    email: input.email,
    phone: input.phone,
    full_name: input.fullName,
    governorate: input.governorate,
    city: input.city,
    address_line: input.addressLine,
    notes: input.notes ?? "",
    payment_method: input.paymentMethod,
    shipping_rate_id: quote.shipping.id,
    shipping_method_name: shippingName,
    coupon_id: quote.coupon?.id ?? null,
    coupon_code: quote.coupon?.code ?? null,
    subtotal: toDecimalString(quote.totals.subtotal),
    discount_total: toDecimalString(quote.totals.discount),
    shipping_fee: toDecimalString(quote.totals.shippingFee),
    cod_fee: toDecimalString(quote.totals.codFee),
    total: toDecimalString(quote.totals.total),
    reservation_minutes: settings.reservationMinutes,
    items: quote.lines.map((line, i) => ({
      variant_id: line.variantId,
      quantity: line.quantity,
      unit_price: toDecimalString(line.unitPrice),
      line_discount: toDecimalString(quote.totals.lineDiscounts[i] ?? 0),
    })),
  };

  const { data, error } = await db.rpc("place_order", { p: payload });
  if (error) {
    // A concurrent submission with the same idempotency key won the race.
    if (error.code === "23505" && /idempotency/.test(error.message)) {
      const { data: existing } = await db
        .from("orders")
        .select("id, reference")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle();
      if (existing) return { orderId: existing.id, reference: existing.reference, accessToken: null, duplicate: true };
    }
    const code = mapDatabaseError(error.message);
    if (code === "server") logger.error("checkout.place_order_failed", { code: error.code, message: error.message });
    throw new CheckoutError(code);
  }

  const result = data as { order_id: string; reference: string; duplicate: boolean };
  if (result.duplicate) {
    return { orderId: result.order_id, reference: result.reference, accessToken: null, duplicate: true };
  }

  // Empty the cart (the coupon has been redeemed on the order).
  const cart = await findCurrentCart();
  if (cart) {
    await db.from("cart_items").delete().eq("cart_id", cart.id);
    await db.from("carts").update({ coupon_code: null }).eq("id", cart.id);
  }

  logger.info("checkout.order_placed", { reference: result.reference, method: input.paymentMethod });
  return { orderId: result.order_id, reference: result.reference, accessToken, duplicate: false };
}

/** Stores the guest access token in an httpOnly cookie scoped to this order. */
export async function rememberOrderToken(reference: string, token: string) {
  (await cookies()).set(`${ORDER_TOKEN_COOKIE_PREFIX}${reference}`, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
}

import "server-only";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { toPiasters, type Piasters } from "@/lib/money";
import { safeEqual, sha256 } from "@/lib/security/tokens";
import { storageUrl } from "@/lib/storage";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { ORDER_TOKEN_COOKIE_PREFIX } from "./checkout";
import { canStartPayment, type OrderForPayment } from "./payments/attempts";

export const ORDER_REFERENCE_RE = /^SL-\d{6}-[A-Z0-9]{6}$/;

export interface OrderItemView {
  id: string;
  nameAr: string;
  nameEn: string;
  variantAr: string | null;
  variantEn: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: Piasters;
  quantity: number;
  lineTotal: Piasters;
}

export interface OrderView {
  id: string;
  reference: string;
  locale: "ar" | "en";
  status: string;
  paymentStatus: string;
  paymentMethod: "paymob_card" | "paymob_wallet" | "cod";
  createdAt: string;
  fullName: string;
  email: string;
  phone: string;
  governorate: string;
  city: string;
  addressLine: string;
  notes: string | null;
  shippingMethodName: string | null;
  couponCode: string | null;
  subtotal: Piasters;
  discountTotal: Piasters;
  shippingFee: Piasters;
  codFee: Piasters;
  total: Piasters;
  reservationExpiresAt: string | null;
  items: OrderItemView[];
  history: { toStatus: string; paymentStatus: string | null; createdAt: string }[];
  canRetryPayment: boolean;
  displayState: "confirmed" | "paid" | "pending" | "failed" | "expired" | "on_hold" | "cancelled";
}

export type OrderAccess = { order: OrderView; via: "owner" | "token"; token: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOrder(row: any, items: any[], history: any[]): OrderView {
  const forPayment = row as OrderForPayment;
  const now = Date.now();
  const reservationLapsed =
    row.stock_state === "reserved" && row.reservation_expires_at && new Date(row.reservation_expires_at).getTime() <= now;
  let displayState: OrderView["displayState"];
  if (row.status === "on_hold") displayState = "on_hold";
  else if (row.payment_status === "expired" || (reservationLapsed && row.payment_status !== "paid")) displayState = "expired";
  else if (row.status === "cancelled") displayState = "cancelled";
  else if (row.payment_method === "cod") displayState = "confirmed";
  else if (row.payment_status === "paid" || row.payment_status === "refunded" || row.payment_status === "partially_refunded")
    displayState = "paid";
  else if (row.payment_status === "failed") displayState = "failed";
  else displayState = "pending";

  return {
    id: row.id,
    reference: row.reference,
    locale: row.locale,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    governorate: row.governorate,
    city: row.city,
    addressLine: row.address_line,
    notes: row.notes,
    shippingMethodName: row.shipping_method_name,
    couponCode: row.coupon_code,
    subtotal: toPiasters(row.subtotal),
    discountTotal: toPiasters(row.discount_total),
    shippingFee: toPiasters(row.shipping_fee),
    codFee: toPiasters(row.cod_fee),
    total: toPiasters(row.total),
    reservationExpiresAt: row.reservation_expires_at,
    items: items.map((i) => ({
      id: i.id,
      nameAr: i.product_name_ar,
      nameEn: i.product_name_en,
      variantAr: i.variant_name_ar,
      variantEn: i.variant_name_en,
      sku: i.sku,
      imageUrl: storageUrl("product-images", i.image_path),
      unitPrice: toPiasters(i.unit_price),
      quantity: i.quantity,
      lineTotal: toPiasters(i.line_total),
    })),
    history: history.map((h) => ({ toStatus: h.to_status, paymentStatus: h.payment_status, createdAt: h.created_at })),
    canRetryPayment: canStartPayment(forPayment),
    displayState,
  };
}

const ORDER_COLUMNS =
  "id, reference, access_token_hash, user_id, locale, status, payment_status, payment_method, created_at, full_name, email, phone, governorate, city, address_line, notes, shipping_method_name, coupon_code, subtotal, discount_total, shipping_fee, cod_fee, total, stock_state, reservation_expires_at";

async function loadOrderWithChildren(reference: string) {
  const db = createServiceClient();
  const { data: order } = await db.from("orders").select(ORDER_COLUMNS).eq("reference", reference).maybeSingle();
  if (!order) return null;
  const [items, history] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", order.id).order("created_at"),
    db.from("order_status_history").select("to_status, payment_status, created_at").eq("order_id", order.id).order("created_at"),
  ]);
  return { order, items: items.data ?? [], history: history.data ?? [] };
}

/**
 * Returns the order only if the viewer is its signed-in owner or presents the order's
 * secret access token (URL `t` or the httpOnly cookie set at checkout). Unknown or
 * unauthorised references are indistinguishable (both return null).
 */
export async function getOrderForViewer(reference: string, tokenFromUrl?: string | null): Promise<OrderAccess | null> {
  if (!ORDER_REFERENCE_RE.test(reference) || !isServiceRoleConfigured()) return null;
  const loaded = await loadOrderWithChildren(reference);
  if (!loaded) return null;
  const { order } = loaded;

  const user = await getSessionUser();
  if (user && order.user_id === user.id) {
    const cookieToken = (await cookies()).get(`${ORDER_TOKEN_COOKIE_PREFIX}${reference}`)?.value ?? null;
    return { order: mapOrder(order, loaded.items, loaded.history), via: "owner", token: cookieToken };
  }

  const cookieToken = (await cookies()).get(`${ORDER_TOKEN_COOKIE_PREFIX}${reference}`)?.value;
  for (const candidate of [tokenFromUrl, cookieToken]) {
    if (candidate && /^[A-Za-z0-9_-]{20,100}$/.test(candidate) && safeEqual(sha256(candidate), order.access_token_hash)) {
      return { order: mapOrder(order, loaded.items, loaded.history), via: "token", token: candidate };
    }
  }
  return null;
}

/** Signed-in customer's orders, read through RLS (customers can only see their own). */
export async function listCustomerOrders(page = 1, pageSize = 10) {
  const [supabase, user] = await Promise.all([createUserClient(), getSessionUser()]);
  if (!supabase || !user) return { orders: [], total: 0 };
  const from = (page - 1) * pageSize;
  const { data, count, error } = await supabase
    .from("orders")
    .select("id, reference, status, payment_status, payment_method, total, created_at", { count: "exact" })
    // RLS limits customers to their own rows; the explicit filter also keeps staff accounts
    // (who may read all orders) to their own purchases here.
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) throw new Error(`orders: ${error.message}`);
  return {
    orders: (data ?? []).map((o) => ({
      id: o.id,
      reference: o.reference,
      status: o.status as string,
      paymentStatus: o.payment_status as string,
      paymentMethod: o.payment_method as string,
      total: toPiasters(o.total),
      createdAt: o.created_at,
    })),
    total: count ?? 0,
  };
}

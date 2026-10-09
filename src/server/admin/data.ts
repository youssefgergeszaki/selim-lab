import "server-only";
import { toPiasters } from "@/lib/money";
import { createServiceClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";

/**
 * Dashboard data loaders. They use the service role and must only be called from dashboard
 * pages that have already verified the staff session (requireStaffPage).
 */

export const PAGE_SIZE = 25;

export function pageRange(page: number, size = PAGE_SIZE) {
  const p = Math.max(1, Math.floor(page) || 1);
  return { page: p, from: (p - 1) * size, to: (p - 1) * size + size - 1 };
}

/** Escapes a free-text search for use inside a PostgREST `or()` ilike filter. */
export function searchTerm(raw: string | undefined): string | null {
  const term = (raw ?? "").replace(/[%_*,()\\"'.:]/g, " ").trim().slice(0, 60);
  return term || null;
}

export async function getOverviewStats() {
  const db = createServiceClient();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const since30 = new Date(now.getTime() - 30 * 86400_000).toISOString();

  const [today, last30, awaiting, attention, revenueRows, variants, settings, recent] = await Promise.all([
    db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", startOfDay.toISOString()),
    db.from("orders").select("id", { count: "exact", head: true }).gte("created_at", since30),
    db.from("orders").select("id", { count: "exact", head: true }).in("status", ["confirmed", "processing"]),
    db.from("orders").select("id", { count: "exact", head: true }).eq("needs_attention", true),
    db.from("orders").select("total").eq("payment_status", "paid").gte("paid_at", since30).limit(10000),
    db
      .from("product_variants")
      .select("id, sku, name_ar, name_en, stock_quantity, reserved_quantity, is_active, product_id, products!inner(status, product_translations(locale, name))")
      .eq("is_active", true)
      .order("stock_quantity")
      .limit(200),
    db.from("store_settings").select("low_stock_threshold").eq("id", 1).single(),
    db
      .from("orders")
      .select("id, reference, full_name, status, payment_status, payment_method, total, created_at, needs_attention")
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const threshold = settings.data?.low_stock_threshold ?? 5;
  const lowStock = (variants.data ?? [])
    .map((v) => ({
      id: v.id,
      productId: v.product_id,
      sku: v.sku,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      translations: ((v.products as any)?.product_translations ?? []) as { locale: string; name: string }[],
      available: Math.max(v.stock_quantity - v.reserved_quantity, 0),
    }))
    .filter((v) => v.available <= threshold);
  return {
    ordersToday: today.count ?? 0,
    orders30: last30.count ?? 0,
    awaiting: awaiting.count ?? 0,
    needsAttention: attention.count ?? 0,
    revenue30: (revenueRows.data ?? []).reduce((sum, r) => sum + toPiasters(r.total), 0),
    lowStock,
    outOfStockCount: lowStock.filter((v) => v.available === 0).length,
    recent: (recent.data ?? []).map((o) => ({ ...o, total: toPiasters(o.total) })),
  };
}

export async function listAdminProducts(params: { q?: string; status?: string; page: number }) {
  const db = createServiceClient();
  const { from, to, page } = pageRange(params.page);
  let query = db
    .from("products")
    .select(
      "id, status, is_featured, sales_count, updated_at, product_translations(locale, name, slug), product_variants(id, sku, price, stock_quantity, reserved_quantity, is_active), product_images(storage_path, sort_order)",
      { count: "exact" },
    )
    .order("updated_at", { ascending: false })
    .range(from, to);
  if (params.status && ["draft", "published", "archived"].includes(params.status)) query = query.eq("status", params.status);
  const term = searchTerm(params.q);
  if (term) {
    const [{ data: byName }, { data: bySku }] = await Promise.all([
      db.from("product_translations").select("product_id").ilike("name", `%${term}%`).limit(200),
      db.from("product_variants").select("product_id").ilike("sku", `%${term}%`).limit(200),
    ]);
    const ids = [...new Set([...(byName ?? []), ...(bySku ?? [])].map((r) => r.product_id as string))];
    if (ids.length === 0) return { items: [], total: 0, page };
    query = query.in("id", ids);
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return {
    page,
    total: count ?? 0,
    items: (data ?? []).map((p) => {
      const images = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      const variants = p.product_variants ?? [];
      return {
        id: p.id,
        status: p.status as string,
        isFeatured: p.is_featured,
        salesCount: p.sales_count,
        updatedAt: p.updated_at,
        nameAr: p.product_translations?.find((t) => t.locale === "ar")?.name ?? "",
        nameEn: p.product_translations?.find((t) => t.locale === "en")?.name ?? "",
        imageUrl: storageUrl("product-images", images[0]?.storage_path),
        variantCount: variants.length,
        minPrice: variants.length ? Math.min(...variants.map((v) => toPiasters(v.price))) : null,
        available: variants.filter((v) => v.is_active).reduce((n, v) => n + Math.max(v.stock_quantity - v.reserved_quantity, 0), 0),
      };
    }),
  };
}

export async function getAdminProduct(id: string) {
  const db = createServiceClient();
  const [product, translations, variants, images, categories, allCategories] = await Promise.all([
    db.from("products").select("*").eq("id", id).maybeSingle(),
    db.from("product_translations").select("*").eq("product_id", id),
    db.from("product_variants").select("*").eq("product_id", id).order("sort_order").order("created_at"),
    db.from("product_images").select("*").eq("product_id", id).order("sort_order"),
    db.from("product_categories").select("category_id").eq("product_id", id),
    db.from("categories").select("id, kind, name_ar, name_en, is_visible").order("kind").order("sort_order"),
  ]);
  if (!product.data) return null;
  return {
    product: product.data,
    ar: translations.data?.find((t) => t.locale === "ar") ?? null,
    en: translations.data?.find((t) => t.locale === "en") ?? null,
    variants: variants.data ?? [],
    images: (images.data ?? []).map((img) => ({ ...img, url: storageUrl("product-images", img.storage_path) })),
    categoryIds: new Set((categories.data ?? []).map((c) => c.category_id as string)),
    allCategories: allCategories.data ?? [],
  };
}

export async function listAdminOrders(params: {
  q?: string;
  status?: string;
  payment?: string;
  attention?: boolean;
  page: number;
}) {
  const db = createServiceClient();
  const { from, to, page } = pageRange(params.page);
  let query = db
    .from("orders")
    .select("id, reference, full_name, email, phone, status, payment_status, payment_method, total, created_at, needs_attention", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (params.status) query = query.eq("status", params.status);
  if (params.payment) query = query.eq("payment_status", params.payment);
  if (params.attention) query = query.eq("needs_attention", true);
  const term = searchTerm(params.q);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const filters = [`reference.ilike.%${term.toUpperCase()}%`, `email.ilike.%${term.toLowerCase()}%`];
    if (digits.length >= 4) filters.push(`phone.ilike.%${digits}%`);
    query = query.or(filters.join(","));
  }
  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { page, total: count ?? 0, items: (data ?? []).map((o) => ({ ...o, total: toPiasters(o.total) })) };
}

export async function getAdminOrder(id: string) {
  const db = createServiceClient();
  const [order, items, history, payments, events] = await Promise.all([
    db.from("orders").select("*").eq("id", id).maybeSingle(),
    db.from("order_items").select("*").eq("order_id", id).order("created_at"),
    db.from("order_status_history").select("*").eq("order_id", id).order("created_at"),
    db
      .from("payments")
      .select("id, attempt, method, status, amount, currency, special_reference, provider_order_id, transaction_id, failure_reason, created_at")
      .eq("order_id", id)
      .order("attempt"),
    db
      .from("payment_events")
      .select("id, event_key, source, transaction_id, hmac_valid, outcome, created_at")
      .eq("order_id", id)
      .order("created_at"),
  ]);
  if (!order.data) return null;
  return {
    order: order.data,
    items: items.data ?? [],
    history: history.data ?? [],
    payments: payments.data ?? [],
    events: events.data ?? [],
  };
}

import "server-only";
import type { Locale } from "@/i18n/config";
import { pick } from "@/i18n";
import { toPiasters, type Piasters } from "@/lib/money";
import { createPublicClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";
import type { ShippingRateRecord, ShippingZoneRecord } from "@/lib/commerce/shipping";
import { cachedPublic, TAGS } from "./cache";

export interface StoreSettings {
  contactEmail: string | null;
  contactPhone: string | null;
  whatsapp: string | null;
  addressAr: string | null;
  addressEn: string | null;
  social: Record<string, string>;
  announcementAr: string | null;
  announcementEn: string | null;
  announcementActive: boolean;
  codEnabled: boolean;
  codFee: Piasters;
  codMaxTotal: Piasters | null;
  paymobCardEnabled: boolean;
  paymobWalletEnabled: boolean;
  reservationMinutes: number;
  lowStockThreshold: number;
}

export const defaultSettings: StoreSettings = {
  contactEmail: null,
  contactPhone: null,
  whatsapp: null,
  addressAr: null,
  addressEn: null,
  social: {},
  announcementAr: null,
  announcementEn: null,
  announcementActive: false,
  codEnabled: false,
  codFee: 0,
  codMaxTotal: null,
  paymobCardEnabled: false,
  paymobWalletEnabled: false,
  reservationMinutes: 30,
  lowStockThreshold: 5,
};

const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "youtube", "x"] as const;

export function parseSocial(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!value || typeof value !== "object") return out;
  for (const key of SOCIAL_KEYS) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === "string" && /^https:\/\//.test(v)) out[key] = v;
  }
  return out;
}

async function loadSettings(): Promise<StoreSettings> {
  const supabase = createPublicClient();
  if (!supabase) return defaultSettings;
  const { data, error } = await supabase.from("store_settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(`settings: ${error.message}`);
  if (!data) return defaultSettings;
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

export const getStoreSettings = cachedPublic(loadSettings, ["store-settings"], [TAGS.settings]);

// ---------------------------------------------------------------------------
// Homepage sections
// ---------------------------------------------------------------------------
export interface SectionCopy {
  eyebrow?: string;
  title?: string;
  body?: string;
  cta_label?: string;
  cta_href?: string;
}

export interface HomepageSection {
  key: string;
  isActive: boolean;
  sortOrder: number;
  copy: SectionCopy;
  imageUrl: string | null;
}

function parseCopy(content: unknown, locale: Locale): SectionCopy {
  if (!content || typeof content !== "object") return {};
  const forLocale = (content as Record<string, unknown>)[locale];
  if (!forLocale || typeof forLocale !== "object") return {};
  const out: SectionCopy = {};
  for (const key of ["eyebrow", "title", "body", "cta_label", "cta_href"] as const) {
    const value = (forLocale as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  // Only allow internal links or https URLs as CTA targets.
  if (out.cta_href && !/^\/(?!\/)|^https:\/\//.test(out.cta_href)) delete out.cta_href;
  return out;
}

async function loadSections(locale: Locale): Promise<Record<string, HomepageSection>> {
  const supabase = createPublicClient();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("homepage_sections")
    .select("key, is_active, sort_order, content, image_path")
    .eq("is_active", true);
  if (error) throw new Error(`sections: ${error.message}`);
  const out: Record<string, HomepageSection> = {};
  for (const row of data ?? []) {
    out[row.key] = {
      key: row.key,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      copy: parseCopy(row.content, locale),
      imageUrl: storageUrl("site-media", row.image_path),
    };
  }
  return out;
}

export const getHomepageSections = cachedPublic(loadSections, ["homepage-sections"], [TAGS.content]);

// ---------------------------------------------------------------------------
// FAQs, ingredients, pages
// ---------------------------------------------------------------------------
export interface Faq {
  id: string;
  question: string;
  answer: string;
}

async function loadFaqs(locale: Locale): Promise<Faq[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("faqs")
    .select("id, question_ar, question_en, answer_ar, answer_en")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw new Error(`faqs: ${error.message}`);
  return (data ?? []).map((f) => ({
    id: f.id,
    question: pick(locale, f.question_ar, f.question_en),
    answer: pick(locale, f.answer_ar, f.answer_en),
  }));
}

export const getFaqs = cachedPublic(loadFaqs, ["faqs"], [TAGS.content]);

export interface Ingredient {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

async function loadIngredients(locale: Locale): Promise<Ingredient[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("ingredients")
    .select("id, name_ar, name_en, description_ar, description_en, image_path")
    .eq("is_published", true)
    .order("sort_order");
  if (error) throw new Error(`ingredients: ${error.message}`);
  return (data ?? []).map((i) => ({
    id: i.id,
    name: pick(locale, i.name_ar, i.name_en),
    description: pick(locale, i.description_ar, i.description_en) || null,
    imageUrl: storageUrl("site-media", i.image_path),
  }));
}

export const getIngredients = cachedPublic(loadIngredients, ["ingredients"], [TAGS.content]);

export interface ContentPage {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
}

async function loadPage(locale: Locale, slug: string): Promise<ContentPage | null> {
  const supabase = createPublicClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug, title_ar, title_en, body_ar, body_en, updated_at")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw new Error(`page: ${error.message}`);
  if (!data) return null;
  return {
    slug: data.slug,
    title: pick(locale, data.title_ar, data.title_en),
    body: pick(locale, data.body_ar, data.body_en),
    updatedAt: data.updated_at,
  };
}

export const getContentPage = cachedPublic(loadPage, ["content-page"], [TAGS.content]);

async function loadPageLinks(locale: Locale): Promise<{ slug: string; title: string }[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("content_pages")
    .select("slug, title_ar, title_en")
    .eq("is_published", true)
    .order("slug");
  if (error) throw new Error(`page links: ${error.message}`);
  return (data ?? []).map((p) => ({ slug: p.slug, title: pick(locale, p.title_ar, p.title_en) }));
}

export const getPageLinks = cachedPublic(loadPageLinks, ["page-links"], [TAGS.content]);

// ---------------------------------------------------------------------------
// Reviews (only approved, genuine reviews from signed-in customers)
// ---------------------------------------------------------------------------
export interface Review {
  id: string;
  displayName: string;
  rating: number;
  title: string | null;
  body: string;
  verifiedPurchase: boolean;
  createdAt: string;
  productName?: string;
}

export async function getProductReviews(productId: string): Promise<Review[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("reviews")
    .select("id, display_name, rating, title, body, verified_purchase, created_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`reviews: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    displayName: r.display_name,
    rating: r.rating,
    title: r.title,
    body: r.body,
    verifiedPurchase: r.verified_purchase,
    createdAt: r.created_at,
  }));
}

async function loadRecentReviews(locale: Locale, limit: number): Promise<Review[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("reviews")
    .select("id, display_name, rating, title, body, verified_purchase, created_at, product_id")
    .eq("status", "approved")
    .gte("rating", 4)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`recent reviews: ${error.message}`);
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.product_id as string))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: tr } = await supabase
      .from("product_translations")
      .select("product_id, name")
      .eq("locale", locale)
      .in("product_id", ids);
    for (const t of tr ?? []) names.set(t.product_id, t.name);
  }
  return rows.map((r) => ({
    id: r.id,
    displayName: r.display_name,
    rating: r.rating,
    title: r.title,
    body: r.body,
    verifiedPurchase: r.verified_purchase,
    createdAt: r.created_at,
    productName: names.get(r.product_id),
  }));
}

export const getRecentReviews = cachedPublic(loadRecentReviews, ["recent-reviews"], [TAGS.content]);

// ---------------------------------------------------------------------------
// Shipping configuration
// ---------------------------------------------------------------------------
async function loadShipping(): Promise<{ zones: ShippingZoneRecord[]; rates: ShippingRateRecord[] }> {
  const supabase = createPublicClient();
  if (!supabase) return { zones: [], rates: [] };
  const [zonesRes, ratesRes] = await Promise.all([
    supabase.from("shipping_zones").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("shipping_rates").select("*").eq("is_active", true).order("sort_order"),
  ]);
  if (zonesRes.error) throw new Error(`zones: ${zonesRes.error.message}`);
  if (ratesRes.error) throw new Error(`rates: ${ratesRes.error.message}`);
  return {
    zones: (zonesRes.data ?? []).map(mapZone),
    rates: (ratesRes.data ?? []).map(mapRate),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapZone(z: any): ShippingZoneRecord {
  return {
    id: z.id,
    nameAr: z.name_ar,
    nameEn: z.name_en,
    governorates: z.governorates ?? [],
    isActive: z.is_active,
    sortOrder: z.sort_order,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRate(r: any): ShippingRateRecord {
  return {
    id: r.id,
    zoneId: r.zone_id,
    nameAr: r.name_ar,
    nameEn: r.name_en,
    fee: toPiasters(r.fee),
    minSubtotal: toPiasters(r.min_subtotal),
    maxSubtotal: r.max_subtotal === null ? null : toPiasters(r.max_subtotal),
    freeShippingThreshold: r.free_shipping_threshold === null ? null : toPiasters(r.free_shipping_threshold),
    etaMinDays: r.eta_min_days,
    etaMaxDays: r.eta_max_days,
    isActive: r.is_active,
    sortOrder: r.sort_order,
  };
}

export const getShippingConfig = cachedPublic(loadShipping, ["shipping-config"], [TAGS.shipping]);

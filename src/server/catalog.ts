import "server-only";
import type { Locale } from "@/i18n/config";
import { toPiasters, type Piasters } from "@/lib/money";
import { createPublicClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";
import { cachedPublic, TAGS } from "./cache";

export interface ProductCardData {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  imageUrl: string | null;
  imageAlt: string;
  price: Piasters;
  compareAtPrice: Piasters | null;
  availableQuantity: number;
  variantCount: number;
  defaultVariantId: string;
  isFeatured: boolean;
}

export interface CategoryData {
  id: string;
  kind: "category" | "collection";
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
}

export type SortKey = "featured" | "newest" | "price-asc" | "price-desc";
export const sortKeys: SortKey[] = ["featured", "newest", "price-asc", "price-desc"];

export interface ListProductsParams {
  locale: Locale;
  query?: string;
  categorySlug?: string;
  sort?: SortKey;
  inStockOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductPage {
  items: ProductCardData[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

interface ListingRow {
  product_id: string;
  locale: Locale;
  name: string;
  slug: string;
  short_description: string | null;
  is_featured: boolean;
  min_price: string | number;
  compare_at_price: string | number | null;
  available_quantity: number;
  variant_count: number;
  default_variant_id: string;
  image_path: string | null;
  image_alt_ar: string | null;
  image_alt_en: string | null;
}

const LISTING_COLUMNS =
  "product_id, locale, name, slug, short_description, is_featured, min_price, compare_at_price, available_quantity, variant_count, default_variant_id, image_path, image_alt_ar, image_alt_en";

function mapListing(row: ListingRow, locale: Locale): ProductCardData {
  const price = toPiasters(row.min_price);
  const compare = row.compare_at_price === null ? null : toPiasters(row.compare_at_price);
  return {
    id: row.product_id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    imageUrl: storageUrl("product-images", row.image_path),
    imageAlt: (locale === "ar" ? row.image_alt_ar : row.image_alt_en) || row.name,
    price,
    compareAtPrice: compare !== null && compare > price ? compare : null,
    availableQuantity: row.available_quantity ?? 0,
    variantCount: row.variant_count,
    defaultVariantId: row.default_variant_id,
    isFeatured: row.is_featured,
  };
}

/** Mirrors public.normalize_search() so Arabic queries match regardless of hamza/taa forms. */
export function normalizeSearch(text: string): string {
  return text
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase();
}

/** Removes characters with meaning in PostgREST filter syntax or LIKE patterns. */
export function sanitizeSearchTerm(raw: string): string {
  return normalizeSearch(raw)
    .replace(/[%_*,()\\"'.:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

async function loadCategories(locale: Locale): Promise<CategoryData[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("categories")
    .select("id, kind, slug, name_ar, name_en, description_ar, description_en, image_path")
    .eq("is_visible", true)
    .order("sort_order")
    .order("name_en");
  if (error) throw new Error(`categories: ${error.message}`);
  return (data ?? []).map((c) => ({
    id: c.id,
    kind: c.kind,
    slug: c.slug,
    name: (locale === "ar" ? c.name_ar : c.name_en) || c.name_en,
    description: (locale === "ar" ? c.description_ar : c.description_en) ?? null,
    imageUrl: storageUrl("site-media", c.image_path),
  }));
}

export const getCategories = cachedPublic(loadCategories, ["categories"], [TAGS.catalog]);

async function loadProducts(params: ListProductsParams): Promise<ProductPage> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 12, 1), 48);
  const page = Math.max(params.page ?? 1, 1);
  const empty: ProductPage = { items: [], total: 0, page, pageSize, pageCount: 0 };
  const supabase = createPublicClient();
  if (!supabase) return empty;

  let query = supabase
    .from("product_listing")
    .select(LISTING_COLUMNS, { count: "exact" })
    .eq("locale", params.locale);

  if (params.categorySlug) {
    const categories = await getCategories(params.locale);
    const category = categories.find((c) => c.slug === params.categorySlug);
    if (!category) return empty;
    query = query.contains("category_ids", [category.id]);
  }
  const term = params.query ? sanitizeSearchTerm(params.query) : "";
  if (term) {
    for (const word of term.split(" ").slice(0, 5)) {
      query = query.ilike("search_text", `%${word}%`);
    }
  }
  if (params.inStockOnly) query = query.gt("available_quantity", 0);

  switch (params.sort) {
    case "newest":
      query = query.order("published_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
      break;
    case "price-asc":
      query = query.order("min_price", { ascending: true }).order("sort_order");
      break;
    case "price-desc":
      query = query.order("min_price", { ascending: false }).order("sort_order");
      break;
    default:
      query = query
        .order("is_featured", { ascending: false })
        .order("sort_order")
        .order("created_at", { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(`products: ${error.message}`);
  const total = count ?? 0;
  return {
    items: (data as ListingRow[] | null ?? []).map((row) => mapListing(row, params.locale)),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
  };
}

export const listProducts = cachedPublic(loadProducts, ["products"], [TAGS.catalog]);

async function loadBestSellers(locale: Locale, limit: number): Promise<ProductCardData[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("product_listing")
    .select(LISTING_COLUMNS)
    .eq("locale", locale)
    .gt("sales_count", 0)
    .order("sales_count", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`best sellers: ${error.message}`);
  return (data as ListingRow[] | null ?? []).map((row) => mapListing(row, locale));
}

/** Best sellers by confirmed units sold (updated when payments are confirmed). */
export const getBestSellers = cachedPublic(loadBestSellers, ["best-sellers"], [TAGS.catalog]);

async function loadFeatured(locale: Locale, limit: number): Promise<ProductCardData[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("product_listing")
    .select(LISTING_COLUMNS)
    .eq("locale", locale)
    .eq("is_featured", true)
    .order("sort_order")
    .limit(limit);
  if (error) throw new Error(`featured: ${error.message}`);
  return (data as ListingRow[] | null ?? []).map((row) => mapListing(row, locale));
}

export const getFeaturedProducts = cachedPublic(loadFeatured, ["featured"], [TAGS.catalog]);

async function loadCatalogSize(): Promise<number> {
  const supabase = createPublicClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("product_listing")
    .select("product_id", { count: "exact", head: true })
    .eq("locale", "en");
  if (error) throw new Error(`catalog size: ${error.message}`);
  return count ?? 0;
}

export const getCatalogSize = cachedPublic(loadCatalogSize, ["catalog-size"], [TAGS.catalog]);

// ---------------------------------------------------------------------------
// Product detail
// ---------------------------------------------------------------------------

export interface VariantData {
  id: string;
  sku: string;
  name: string | null;
  price: Piasters;
  compareAtPrice: Piasters | null;
  available: number;
  isDefault: boolean;
}

export interface ProductAttribute {
  label: string;
  value: string;
}

export interface ProductDetail {
  id: string;
  locale: Locale;
  slug: string;
  slugs: Partial<Record<Locale, string>>;
  name: string;
  shortDescription: string | null;
  description: string | null;
  ingredients: string | null;
  howToUse: string | null;
  warnings: string | null;
  attributes: ProductAttribute[];
  seoTitle: string | null;
  seoDescription: string | null;
  images: { url: string; alt: string }[];
  variants: VariantData[];
  categories: CategoryData[];
  updatedAt: string;
}

interface TranslationRow {
  product_id: string;
  locale: Locale;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  ingredients: string | null;
  how_to_use: string | null;
  warnings: string | null;
  attributes: unknown;
  seo_title: string | null;
  seo_description: string | null;
}

function parseAttributes(value: unknown): ProductAttribute[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (a): a is ProductAttribute =>
        !!a && typeof a === "object" && typeof (a as ProductAttribute).label === "string" && typeof (a as ProductAttribute).value === "string",
    )
    .slice(0, 20);
}

/**
 * Finds a product by slug. If the slug belongs to the other locale (e.g. after switching
 * language), `redirectSlug` gives the correct localized slug.
 */
export async function getProductBySlug(
  locale: Locale,
  slug: string,
): Promise<{ product: ProductDetail | null; redirectSlug?: string }> {
  const supabase = createPublicClient();
  if (!supabase) return { product: null };

  const { data: matches, error } = await supabase
    .from("product_translations")
    .select("product_id, locale, slug")
    .eq("slug", slug)
    .limit(2);
  if (error) throw new Error(`product slug: ${error.message}`);
  if (!matches || matches.length === 0) return { product: null };
  const exact = matches.find((m) => m.locale === locale);
  const productId = (exact ?? matches[0]).product_id as string;

  const [productRes, translationsRes, variantsRes, imagesRes, categoriesRes] = await Promise.all([
    supabase.from("products").select("id, status, updated_at").eq("id", productId).maybeSingle(),
    supabase
      .from("product_translations")
      .select("product_id, locale, name, slug, short_description, description, ingredients, how_to_use, warnings, attributes, seo_title, seo_description")
      .eq("product_id", productId),
    supabase
      .from("product_variants")
      .select("id, sku, name_ar, name_en, price, compare_at_price, stock_quantity, reserved_quantity, is_default, sort_order")
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("product_images")
      .select("storage_path, alt_ar, alt_en, sort_order")
      .eq("product_id", productId)
      .order("sort_order"),
    supabase.from("product_categories").select("category_id").eq("product_id", productId),
  ]);

  for (const res of [productRes, translationsRes, variantsRes, imagesRes, categoriesRes]) {
    if (res.error) throw new Error(`product detail: ${res.error.message}`);
  }
  if (!productRes.data || productRes.data.status !== "published") return { product: null };

  const translations = (translationsRes.data ?? []) as TranslationRow[];
  const tr = translations.find((t) => t.locale === locale) ?? translations[0];
  if (!tr) return { product: null };
  if (tr.locale === locale && tr.slug !== slug) {
    return { product: null, redirectSlug: tr.slug };
  }

  const variants: VariantData[] = (variantsRes.data ?? []).map((v) => {
    const price = toPiasters(v.price);
    const compare = v.compare_at_price === null ? null : toPiasters(v.compare_at_price);
    return {
      id: v.id,
      sku: v.sku,
      name: (locale === "ar" ? v.name_ar : v.name_en) || v.name_en || v.name_ar || null,
      price,
      compareAtPrice: compare !== null && compare > price ? compare : null,
      available: Math.max(v.stock_quantity - v.reserved_quantity, 0),
      isDefault: v.is_default,
    };
  });
  if (variants.length === 0) return { product: null };

  const allCategories = await getCategories(locale);
  const categoryIds = new Set((categoriesRes.data ?? []).map((c) => c.category_id as string));

  return {
    product: {
      id: productId,
      locale,
      slug: tr.slug,
      slugs: Object.fromEntries(translations.map((t) => [t.locale, t.slug])),
      name: tr.name,
      shortDescription: tr.short_description,
      description: tr.description,
      ingredients: tr.ingredients,
      howToUse: tr.how_to_use,
      warnings: tr.warnings,
      attributes: parseAttributes(tr.attributes),
      seoTitle: tr.seo_title,
      seoDescription: tr.seo_description,
      images: (imagesRes.data ?? [])
        .map((img) => ({
          url: storageUrl("product-images", img.storage_path),
          alt: (locale === "ar" ? img.alt_ar : img.alt_en) || tr.name,
        }))
        .filter((img): img is { url: string; alt: string } => Boolean(img.url)),
      variants,
      // Product categories first, then collections (the first entry is used for breadcrumbs).
      categories: allCategories
        .filter((c) => categoryIds.has(c.id))
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "category" ? -1 : 1)),
      updatedAt: productRes.data.updated_at,
    },
  };
}

export async function getRelatedProducts(
  locale: Locale,
  product: ProductDetail,
  limit = 4,
): Promise<ProductCardData[]> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  let query = supabase
    .from("product_listing")
    .select(LISTING_COLUMNS)
    .eq("locale", locale)
    .neq("product_id", product.id)
    .limit(limit);
  const categoryIds = product.categories.map((c) => c.id);
  if (categoryIds.length > 0) query = query.overlaps("category_ids", categoryIds);
  const { data, error } = await query.order("sales_count", { ascending: false });
  if (error) throw new Error(`related: ${error.message}`);
  let items = (data as ListingRow[] | null ?? []).map((row) => mapListing(row, locale));
  if (items.length < limit && categoryIds.length > 0) {
    const fallback = await getFeaturedProducts(locale, limit + 1);
    for (const p of fallback) {
      if (items.length >= limit) break;
      if (p.id !== product.id && !items.some((i) => i.id === p.id)) items.push(p);
    }
  }
  items = items.slice(0, limit);
  return items;
}

/** All published product slugs for the sitemap. */
export async function getAllProductSlugs(): Promise<
  { productId: string; locale: Locale; slug: string; updatedAt: string }[]
> {
  const supabase = createPublicClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("product_translations")
    .select("product_id, locale, slug, updated_at, products!inner(status)")
    .eq("products.status", "published");
  if (error) throw new Error(`slugs: ${error.message}`);
  return (data ?? []).map((row) => ({
    productId: row.product_id,
    locale: row.locale as Locale,
    slug: row.slug,
    updatedAt: row.updated_at,
  }));
}

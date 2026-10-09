"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  checkboxSchema,
  localizedSlugSchema,
  moneyInputSchema,
  optionalMoneyInputSchema,
  intInputSchema,
  slugify,
  cleanText,
} from "@/lib/validation/common";
import { TAGS } from "@/server/cache";
import {
  adminAction,
  check,
  fieldsFromIssues,
  formFile,
  formString,
  removeImage,
  uploadImage,
  type AdminResult,
} from "@/server/admin/guard";

const text = (max: number) => z.string().max(max).transform(cleanText);

function parseAttributes(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => {
      const idx = line.indexOf(":");
      return idx > 0
        ? { label: line.slice(0, idx).trim().slice(0, 60), value: line.slice(idx + 1).trim().slice(0, 200) }
        : { label: line.slice(0, 60), value: "" };
    })
    .filter((a) => a.label && a.value);
}

const translationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: localizedSlugSchema,
  short_description: text(500),
  description: text(10000),
  ingredients: text(10000),
  how_to_use: text(5000),
  warnings: text(5000),
  attributes: z.string().max(4000).transform(parseAttributes),
  seo_title: text(120),
  seo_description: text(320),
});

function readTranslation(formData: FormData, locale: "ar" | "en") {
  const get = (k: string) => formString(formData, `${k}_${locale}`);
  const name = get("name");
  return {
    name,
    slug: get("slug") || slugify(name),
    short_description: get("short_description"),
    description: get("description"),
    ingredients: get("ingredients"),
    how_to_use: get("how_to_use"),
    warnings: get("warnings"),
    attributes: get("attributes"),
    seo_title: get("seo_title"),
    seo_description: get("seo_description"),
  };
}

const nullIfEmpty = (v: string) => (v.trim() ? v : null);

export async function createProduct(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const ar = translationSchema.pick({ name: true, slug: true }).safeParse(readTranslation(formData, "ar"));
    const en = translationSchema.pick({ name: true, slug: true }).safeParse(readTranslation(formData, "en"));
    if (!ar.success || !en.success) {
      return { ok: false, error: "validation", fields: [...(ar.success ? [] : ["name_ar"]), ...(en.success ? [] : ["name_en"])] };
    }
    const db = createServiceClient();
    const { data: product } = check(await db.from("products").insert({ status: "draft" }).select("id").single(), "product");
    const res = await db.from("product_translations").insert([
      { product_id: product!.id, locale: "ar", name: ar.data.name, slug: ar.data.slug },
      { product_id: product!.id, locale: "en", name: en.data.name, slug: en.data.slug },
    ]);
    if (res.error) {
      await db.from("products").delete().eq("id", product!.id);
      check(res, "translations");
    }
    await audit(ctx, "product.create", "product", product!.id, { name_en: en.data.name });
    updateTag(TAGS.catalog);
    return { ok: true, id: product!.id };
  });
}

export async function updateProduct(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const meta = z
      .object({
        status: z.enum(["draft", "published", "archived"]),
        is_featured: checkboxSchema,
        sort_order: intInputSchema(-100000, 100000),
      })
      .safeParse({
        status: formString(formData, "status"),
        is_featured: formData.get("is_featured"),
        sort_order: formString(formData, "sort_order") || "0",
      });
    const ar = translationSchema.safeParse(readTranslation(formData, "ar"));
    const en = translationSchema.safeParse(readTranslation(formData, "en"));
    if (!meta.success || !ar.success || !en.success) {
      return {
        ok: false,
        error: "validation",
        fields: [
          ...(meta.success ? [] : fieldsFromIssues(meta.error.issues)),
          ...(ar.success ? [] : fieldsFromIssues(ar.error.issues).map((f) => `${f}_ar`)),
          ...(en.success ? [] : fieldsFromIssues(en.error.issues).map((f) => `${f}_en`)),
        ],
      };
    }
    const categoryIds = z.array(z.uuid()).max(50).parse(formData.getAll("categories").map(String));
    const db = createServiceClient();

    const { data: existing } = check(await db.from("products").select("status, published_at").eq("id", id).single(), "product");
    if (meta.data.status === "published") {
      const { count } = await db
        .from("product_variants")
        .select("id", { count: "exact", head: true })
        .eq("product_id", id)
        .eq("is_active", true);
      if (!count) return { ok: false, error: "no_variants" };
    }

    check(
      await db
        .from("products")
        .update({
          status: meta.data.status,
          is_featured: meta.data.is_featured,
          sort_order: meta.data.sort_order,
          published_at: meta.data.status === "published" ? (existing!.published_at ?? new Date().toISOString()) : existing!.published_at,
        })
        .eq("id", id),
      "product update",
    );
    for (const [locale, t] of [
      ["ar", ar.data],
      ["en", en.data],
    ] as const) {
      check(
        await db.from("product_translations").upsert(
          {
            product_id: id,
            locale,
            name: t.name,
            slug: t.slug,
            short_description: nullIfEmpty(t.short_description),
            description: nullIfEmpty(t.description),
            ingredients: nullIfEmpty(t.ingredients),
            how_to_use: nullIfEmpty(t.how_to_use),
            warnings: nullIfEmpty(t.warnings),
            attributes: t.attributes,
            seo_title: nullIfEmpty(t.seo_title),
            seo_description: nullIfEmpty(t.seo_description),
          },
          { onConflict: "product_id,locale" },
        ),
        "translation",
      );
    }
    check(await db.from("product_categories").delete().eq("product_id", id), "categories");
    if (categoryIds.length) {
      check(
        await db.from("product_categories").insert(categoryIds.map((category_id) => ({ product_id: id, category_id }))),
        "categories",
      );
    }
    await audit(ctx, "product.update", "product", id, {
      status: meta.data.status,
      previous_status: existing!.status,
      featured: meta.data.is_featured,
    });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function deleteProduct(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const db = createServiceClient();
    const { count } = await db.from("order_items").select("id", { count: "exact", head: true }).eq("product_id", id);
    if (count) return { ok: false, error: "in_use" };
    const { data: images } = await db.from("product_images").select("storage_path").eq("product_id", id);
    check(await db.from("products").delete().eq("id", id), "delete product");
    for (const img of images ?? []) await removeImage("product-images", img.storage_path);
    await audit(ctx, "product.delete", "product", id);
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

const variantSchema = z.object({
  id: z.uuid().optional(),
  product_id: z.uuid(),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,40}$/),
  name_ar: text(60),
  name_en: text(60),
  price: moneyInputSchema,
  compare_at_price: optionalMoneyInputSchema,
  is_default: checkboxSchema,
  is_active: checkboxSchema,
  sort_order: intInputSchema(-100000, 100000),
  initial_stock: intInputSchema(0, 1_000_000),
});

export async function saveVariant(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const parsed = variantSchema.safeParse({
      id: formString(formData, "id") || undefined,
      product_id: formString(formData, "product_id"),
      sku: formString(formData, "sku"),
      name_ar: formString(formData, "name_ar"),
      name_en: formString(formData, "name_en"),
      price: formString(formData, "price"),
      compare_at_price: formString(formData, "compare_at_price"),
      is_default: formData.get("is_default"),
      is_active: formData.get("is_active"),
      sort_order: formString(formData, "sort_order") || "0",
      initial_stock: formString(formData, "initial_stock") || "0",
    });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const v = parsed.data;
    const db = createServiceClient();
    if (v.is_default) {
      check(await db.from("product_variants").update({ is_default: false }).eq("product_id", v.product_id), "default reset");
    }
    const row = {
      product_id: v.product_id,
      sku: v.sku,
      name_ar: v.name_ar || null,
      name_en: v.name_en || null,
      price: v.price,
      compare_at_price: v.compare_at_price,
      is_default: v.is_default,
      is_active: v.is_active,
      sort_order: v.sort_order,
    };
    let variantId = v.id;
    if (v.id) {
      check(await db.from("product_variants").update(row).eq("id", v.id).eq("product_id", v.product_id), "variant update");
    } else {
      const { data } = check(
        await db.from("product_variants").insert({ ...row, stock_quantity: v.initial_stock }).select("id").single(),
        "variant insert",
      );
      variantId = data!.id;
      if (v.initial_stock > 0) {
        await db.from("inventory_movements").insert({
          variant_id: variantId,
          type: "restock",
          stock_change: v.initial_stock,
          note: "initial stock",
          actor_id: ctx.user.id,
        });
      }
    }
    await audit(ctx, v.id ? "variant.update" : "variant.create", "product_variant", variantId ?? null, {
      sku: v.sku,
      price: v.price,
      compare_at_price: v.compare_at_price,
      active: v.is_active,
    });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function adjustVariantStock(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const parsed = z
      .object({ variant_id: z.uuid(), delta: intInputSchema(-1_000_000, 1_000_000), note: text(300) })
      .safeParse({
        variant_id: formString(formData, "variant_id"),
        delta: formString(formData, "delta"),
        note: formString(formData, "note"),
      });
    if (!parsed.success || parsed.data.delta === 0) return { ok: false, error: "validation", fields: ["delta"] };
    const { data, error } = await createServiceClient().rpc("admin_adjust_stock", {
      p_variant_id: parsed.data.variant_id,
      p_delta: parsed.data.delta,
      p_actor: ctx.user.id,
      p_note: parsed.data.note || null,
    });
    if (error) throw new Error(error.message);
    await audit(ctx, "inventory.adjust", "product_variant", parsed.data.variant_id, {
      delta: parsed.data.delta,
      new_stock: data,
      note: parsed.data.note,
    });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function deleteVariant(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const db = createServiceClient();
    const { count } = await db.from("order_items").select("id", { count: "exact", head: true }).eq("variant_id", id);
    if (count) return { ok: false, error: "in_use" };
    const { data: variant } = await db.from("product_variants").select("reserved_quantity, sku").eq("id", id).single();
    if (variant && variant.reserved_quantity > 0) return { ok: false, error: "in_use" };
    check(await db.from("product_variants").delete().eq("id", id), "variant delete");
    await audit(ctx, "variant.delete", "product_variant", id, { sku: variant?.sku });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function uploadProductImage(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const productId = z.uuid().parse(formString(formData, "product_id"));
    const path = await uploadImage("product-images", `products/${productId}`, formFile(formData, "image"));
    if (!path) return { ok: false, error: "upload_missing" };
    const db = createServiceClient();
    const { count } = await db.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId);
    const { data } = check(
      await db
        .from("product_images")
        .insert({
          product_id: productId,
          storage_path: path,
          alt_ar: cleanText(formString(formData, "alt_ar")).slice(0, 200) || null,
          alt_en: cleanText(formString(formData, "alt_en")).slice(0, 200) || null,
          sort_order: (count ?? 0) * 10,
        })
        .select("id")
        .single(),
      "image insert",
    );
    await audit(ctx, "product_image.upload", "product", productId, { image_id: data!.id });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function updateProductImage(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const sort = intInputSchema(-100000, 100000).parse(formString(formData, "sort_order") || "0");
    check(
      await createServiceClient()
        .from("product_images")
        .update({
          alt_ar: cleanText(formString(formData, "alt_ar")).slice(0, 200) || null,
          alt_en: cleanText(formString(formData, "alt_en")).slice(0, 200) || null,
          sort_order: sort,
        })
        .eq("id", id),
      "image update",
    );
    await audit(ctx, "product_image.update", "product_image", id);
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function deleteProductImage(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const db = createServiceClient();
    const { data } = await db.from("product_images").select("storage_path, product_id").eq("id", id).single();
    check(await db.from("product_images").delete().eq("id", id), "image delete");
    await removeImage("product-images", data?.storage_path);
    await audit(ctx, "product_image.delete", "product", data?.product_id ?? null, { image_id: id });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/server";
import { checkboxSchema, cleanText, intInputSchema, slugSchema } from "@/lib/validation/common";
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
import { SECTION_KEYS } from "@/server/admin/constants";

const text = (max: number) => z.string().max(max).transform(cleanText);
const required = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));
const sortOrder = () => intInputSchema(-100000, 100000);

function fields(formData: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, formData.get(k) ?? ""]));
}

// ---------------------------------------------------------------------------
// Categories & collections
// ---------------------------------------------------------------------------
const categorySchema = z.object({
  id: z.uuid().optional(),
  kind: z.enum(["category", "collection"]),
  slug: slugSchema,
  name_ar: required(120),
  name_en: required(120),
  description_ar: text(1000),
  description_en: text(1000),
  sort_order: sortOrder(),
  is_visible: checkboxSchema,
});

export async function saveCategory(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const raw = fields(formData, ["kind", "slug", "name_ar", "name_en", "description_ar", "description_en", "sort_order", "is_visible"]);
    const parsed = categorySchema.safeParse({ ...raw, id: formString(formData, "id") || undefined, sort_order: raw.sort_order || "0" });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const { id, ...row } = parsed.data;
    const db = createServiceClient();
    const image = await uploadImage("site-media", "categories", formFile(formData, "image"));
    const payload = {
      ...row,
      description_ar: row.description_ar || null,
      description_en: row.description_en || null,
      ...(image ? { image_path: image } : {}),
    };
    let savedId = id;
    if (id) {
      const { data: old } = await db.from("categories").select("image_path").eq("id", id).single();
      check(await db.from("categories").update(payload).eq("id", id), "category update");
      if (image && old?.image_path) await removeImage("site-media", old.image_path);
    } else {
      const { data } = check(await db.from("categories").insert(payload).select("id").single(), "category insert");
      savedId = data!.id;
    }
    await audit(ctx, id ? "category.update" : "category.create", "category", savedId ?? null, { slug: row.slug, kind: row.kind });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function deleteCategory(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const db = createServiceClient();
    const { data } = await db.from("categories").select("image_path, slug").eq("id", id).single();
    check(await db.from("categories").delete().eq("id", id), "category delete");
    await removeImage("site-media", data?.image_path);
    await audit(ctx, "category.delete", "category", id, { slug: data?.slug });
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Homepage sections
// ---------------------------------------------------------------------------

const copySchema = z.object({
  eyebrow: text(120),
  title: text(200),
  body: text(3000),
  cta_label: text(60),
  cta_href: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === "" || /^\/(?!\/)/.test(v) || /^https:\/\//.test(v), "invalid_link"),
});

export async function saveHomepageSection(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const key = z.enum(SECTION_KEYS).parse(formString(formData, "key"));
    const read = (l: "ar" | "en") =>
      copySchema.safeParse({
        eyebrow: formString(formData, `eyebrow_${l}`),
        title: formString(formData, `title_${l}`),
        body: formString(formData, `body_${l}`),
        cta_label: formString(formData, `cta_label_${l}`),
        cta_href: formString(formData, `cta_href_${l}`),
      });
    const ar = read("ar");
    const en = read("en");
    if (!ar.success || !en.success) {
      return { ok: false, error: "validation", fields: [...(ar.success ? [] : fieldsFromIssues(ar.error.issues)), ...(en.success ? [] : fieldsFromIssues(en.error.issues))] };
    }
    const strip = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v));
    const db = createServiceClient();
    const { data: existing } = await db.from("homepage_sections").select("image_path").eq("key", key).maybeSingle();
    const image = await uploadImage("site-media", `homepage/${key}`, formFile(formData, "image"));
    const removeCurrent = formData.get("remove_image") === "on";
    const imagePath = image ?? (removeCurrent ? null : (existing?.image_path ?? null));
    check(
      await db.from("homepage_sections").upsert(
        {
          key,
          is_active: checkboxSchema.parse(formData.get("is_active")),
          sort_order: SECTION_KEYS.indexOf(key) * 10,
          content: { ar: strip(ar.data), en: strip(en.data) },
          image_path: imagePath,
        },
        { onConflict: "key" },
      ),
      "section",
    );
    if ((image || removeCurrent) && existing?.image_path && existing.image_path !== imagePath) {
      await removeImage("site-media", existing.image_path);
    }
    await audit(ctx, "homepage.update", "homepage_section", key, { image_changed: Boolean(image || removeCurrent) });
    updateTag(TAGS.content);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// FAQs
// ---------------------------------------------------------------------------
const faqSchema = z.object({
  question_ar: required(300),
  question_en: required(300),
  answer_ar: required(5000),
  answer_en: required(5000),
  sort_order: sortOrder(),
  is_published: checkboxSchema,
});

export async function saveFaq(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const raw = fields(formData, ["question_ar", "question_en", "answer_ar", "answer_en", "sort_order", "is_published"]);
    const parsed = faqSchema.safeParse({ ...raw, sort_order: raw.sort_order || "0" });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const id = formString(formData, "id");
    const db = createServiceClient();
    if (id) check(await db.from("faqs").update(parsed.data).eq("id", z.uuid().parse(id)), "faq update");
    else check(await db.from("faqs").insert(parsed.data), "faq insert");
    await audit(ctx, id ? "faq.update" : "faq.create", "faq", id || null);
    updateTag(TAGS.content);
    return { ok: true };
  });
}

export async function deleteFaq(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    check(await createServiceClient().from("faqs").delete().eq("id", id), "faq delete");
    await audit(ctx, "faq.delete", "faq", id);
    updateTag(TAGS.content);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Ingredients
// ---------------------------------------------------------------------------
const ingredientSchema = z.object({
  name_ar: required(120),
  name_en: required(120),
  description_ar: text(2000),
  description_en: text(2000),
  sort_order: sortOrder(),
  is_published: checkboxSchema,
});

export async function saveIngredient(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const raw = fields(formData, ["name_ar", "name_en", "description_ar", "description_en", "sort_order", "is_published"]);
    const parsed = ingredientSchema.safeParse({ ...raw, sort_order: raw.sort_order || "0" });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const id = formString(formData, "id");
    const db = createServiceClient();
    const image = await uploadImage("site-media", "ingredients", formFile(formData, "image"));
    const row = {
      ...parsed.data,
      description_ar: parsed.data.description_ar || null,
      description_en: parsed.data.description_en || null,
      ...(image ? { image_path: image } : {}),
    };
    if (id) {
      const { data: old } = await db.from("ingredients").select("image_path").eq("id", z.uuid().parse(id)).single();
      check(await db.from("ingredients").update(row).eq("id", id), "ingredient update");
      if (image && old?.image_path) await removeImage("site-media", old.image_path);
    } else {
      check(await db.from("ingredients").insert(row), "ingredient insert");
    }
    await audit(ctx, id ? "ingredient.update" : "ingredient.create", "ingredient", id || null, { name_en: parsed.data.name_en });
    updateTag(TAGS.content);
    return { ok: true };
  });
}

export async function deleteIngredient(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const db = createServiceClient();
    const { data } = await db.from("ingredients").select("image_path").eq("id", id).single();
    check(await db.from("ingredients").delete().eq("id", id), "ingredient delete");
    await removeImage("site-media", data?.image_path);
    await audit(ctx, "ingredient.delete", "ingredient", id);
    updateTag(TAGS.content);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Content pages (policies, about, etc.) — stored and rendered as plain text
// ---------------------------------------------------------------------------
const pageSchema = z.object({
  slug: slugSchema,
  title_ar: required(200),
  title_en: required(200),
  body_ar: text(50000),
  body_en: text(50000),
  is_published: checkboxSchema,
});

export async function saveContentPage(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const parsed = pageSchema.safeParse(fields(formData, ["slug", "title_ar", "title_en", "body_ar", "body_en", "is_published"]));
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const id = formString(formData, "id");
    const db = createServiceClient();
    if (id) check(await db.from("content_pages").update(parsed.data).eq("id", z.uuid().parse(id)), "page update");
    else check(await db.from("content_pages").insert(parsed.data), "page insert");
    await audit(ctx, id ? "page.update" : "page.create", "content_page", id || null, { slug: parsed.data.slug });
    updateTag(TAGS.content);
    return { ok: true };
  });
}

export async function deleteContentPage(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    check(await createServiceClient().from("content_pages").delete().eq("id", id), "page delete");
    await audit(ctx, "page.delete", "content_page", id);
    updateTag(TAGS.content);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Review moderation
// ---------------------------------------------------------------------------
export async function moderateReview(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const status = z.enum(["approved", "rejected", "pending"]).parse(formString(formData, "status"));
    check(await createServiceClient().from("reviews").update({ status }).eq("id", id), "review");
    await audit(ctx, "review.moderate", "review", id, { status });
    updateTag(TAGS.content);
    updateTag(TAGS.catalog);
    return { ok: true };
  });
}

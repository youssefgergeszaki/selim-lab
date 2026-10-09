"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/server";
import {
  checkboxSchema,
  cleanText,
  emailSchema,
  intInputSchema,
  optionalMoneyInputSchema,
  moneyInputSchema,
} from "@/lib/validation/common";
import { governorateCodes } from "@/lib/governorates";
import { storeLocalToIso } from "@/lib/dates";
import { TAGS } from "@/server/cache";
import { adminAction, check, fieldsFromIssues, formString, type AdminResult } from "@/server/admin/guard";

const text = (max: number) => z.string().max(max).transform(cleanText);
const required = (max: number) => z.string().transform(cleanText).pipe(z.string().min(1).max(max));

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export async function setOrderStatus(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const parsed = z
      .object({
        id: z.uuid(),
        status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "on_hold"]),
        note: text(500),
        restock: checkboxSchema,
      })
      .parse({
        id: formString(formData, "id"),
        status: formString(formData, "status"),
        note: formString(formData, "note"),
        restock: formData.get("restock"),
      });
    const { error } = await createServiceClient().rpc("admin_set_order_status", {
      p_order_id: parsed.id,
      p_status: parsed.status,
      p_actor: ctx.user.id,
      p_note: parsed.note || null,
      p_restock: parsed.restock,
    });
    if (error) throw new Error(error.message);
    await audit(ctx, "order.status", "order", parsed.id, { status: parsed.status, restock: parsed.restock });
    if (parsed.status === "cancelled") updateTag(TAGS.catalog);
    return { ok: true };
  });
}

export async function setPaymentStatus(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({
        id: z.uuid(),
        payment_status: z.enum(["paid", "refunded", "partially_refunded"]),
        note: text(500),
        restock: checkboxSchema,
      })
      .parse({
        id: formString(formData, "id"),
        payment_status: formString(formData, "payment_status"),
        note: formString(formData, "note"),
        restock: formData.get("restock"),
      });
    const { error } = await createServiceClient().rpc("admin_set_payment_status", {
      p_order_id: parsed.id,
      p_payment_status: parsed.payment_status,
      p_actor: ctx.user.id,
      p_note: parsed.note || null,
      p_restock: parsed.restock,
    });
    if (error) throw new Error(error.message);
    await audit(ctx, "order.payment_status", "order", parsed.id, { payment_status: parsed.payment_status });
    return { ok: true };
  });
}

export async function updateOrderNotes(formData: FormData): Promise<AdminResult> {
  return adminAction("staff", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    const note = text(4000).parse(formString(formData, "admin_note"));
    const clear = formData.get("clear_attention") === "on";
    check(
      await createServiceClient()
        .from("orders")
        .update({ admin_note: note || null, ...(clear ? { needs_attention: false } : {}) })
        .eq("id", id),
      "order notes",
    );
    await audit(ctx, "order.notes", "order", id, { cleared_attention: clear });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------
export async function saveShippingZone(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({
        name_ar: required(120),
        name_en: required(120),
        governorates: z.array(z.enum(governorateCodes)).max(27),
        is_active: checkboxSchema,
        sort_order: intInputSchema(-100000, 100000),
      })
      .safeParse({
        name_ar: formString(formData, "name_ar"),
        name_en: formString(formData, "name_en"),
        governorates: formData.getAll("governorates").map(String),
        is_active: formData.get("is_active"),
        sort_order: formString(formData, "sort_order") || "0",
      });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const id = formString(formData, "id");
    const db = createServiceClient();
    if (id) check(await db.from("shipping_zones").update(parsed.data).eq("id", z.uuid().parse(id)), "zone update");
    else check(await db.from("shipping_zones").insert(parsed.data), "zone insert");
    await audit(ctx, id ? "shipping_zone.update" : "shipping_zone.create", "shipping_zone", id || null, {
      governorates: parsed.data.governorates,
      active: parsed.data.is_active,
    });
    updateTag(TAGS.shipping);
    return { ok: true };
  });
}

export async function deleteShippingZone(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    check(await createServiceClient().from("shipping_zones").delete().eq("id", id), "zone delete");
    await audit(ctx, "shipping_zone.delete", "shipping_zone", id);
    updateTag(TAGS.shipping);
    return { ok: true };
  });
}

export async function saveShippingRate(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({
        zone_id: z.uuid(),
        name_ar: required(120),
        name_en: required(120),
        fee: moneyInputSchema,
        min_subtotal: moneyInputSchema,
        max_subtotal: optionalMoneyInputSchema,
        free_shipping_threshold: optionalMoneyInputSchema,
        eta_min_days: z.union([z.literal("").transform(() => null), intInputSchema(0, 60)]),
        eta_max_days: z.union([z.literal("").transform(() => null), intInputSchema(0, 60)]),
        is_active: checkboxSchema,
        sort_order: intInputSchema(-100000, 100000),
      })
      .safeParse({
        zone_id: formString(formData, "zone_id"),
        name_ar: formString(formData, "name_ar"),
        name_en: formString(formData, "name_en"),
        fee: formString(formData, "fee"),
        min_subtotal: formString(formData, "min_subtotal") || "0",
        max_subtotal: formString(formData, "max_subtotal"),
        free_shipping_threshold: formString(formData, "free_shipping_threshold"),
        eta_min_days: formString(formData, "eta_min_days"),
        eta_max_days: formString(formData, "eta_max_days"),
        is_active: formData.get("is_active"),
        sort_order: formString(formData, "sort_order") || "0",
      });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const id = formString(formData, "id");
    const db = createServiceClient();
    if (id) check(await db.from("shipping_rates").update(parsed.data).eq("id", z.uuid().parse(id)), "rate update");
    else check(await db.from("shipping_rates").insert(parsed.data), "rate insert");
    await audit(ctx, id ? "shipping_rate.update" : "shipping_rate.create", "shipping_rate", id || null, {
      fee: parsed.data.fee,
      free_over: parsed.data.free_shipping_threshold,
    });
    updateTag(TAGS.shipping);
    return { ok: true };
  });
}

export async function deleteShippingRate(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const id = z.uuid().parse(formString(formData, "id"));
    check(await createServiceClient().from("shipping_rates").delete().eq("id", id), "rate delete");
    await audit(ctx, "shipping_rate.delete", "shipping_rate", id);
    updateTag(TAGS.shipping);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------
// <input type="datetime-local"> values are entered in store time (Africa/Cairo).
const optionalDate = z
  .string()
  .trim()
  .transform((v, c) => {
    if (!v) return null;
    const iso = storeLocalToIso(v);
    if (!iso) {
      c.addIssue({ code: "custom", message: "invalid_date" });
      return z.NEVER;
    }
    return iso;
  });

export async function saveCoupon(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-Z0-9_-]{3,32}$/),
        description: text(300),
        discount_type: z.enum(["percentage", "fixed", "free_shipping"]),
        value: moneyInputSchema,
        min_subtotal: moneyInputSchema,
        max_discount: optionalMoneyInputSchema,
        starts_at: optionalDate,
        ends_at: optionalDate,
        usage_limit: z.union([z.literal("").transform(() => null), intInputSchema(1, 10_000_000)]),
        per_customer_limit: z.union([z.literal("").transform(() => null), intInputSchema(1, 1000)]),
        is_active: checkboxSchema,
      })
      .refine((c) => c.discount_type !== "percentage" || Number(c.value) <= 100, { path: ["value"] })
      .safeParse({
        code: formString(formData, "code"),
        description: formString(formData, "description"),
        discount_type: formString(formData, "discount_type"),
        value: formString(formData, "value") || "0",
        min_subtotal: formString(formData, "min_subtotal") || "0",
        max_discount: formString(formData, "max_discount"),
        starts_at: formString(formData, "starts_at"),
        ends_at: formString(formData, "ends_at"),
        usage_limit: formString(formData, "usage_limit"),
        per_customer_limit: formString(formData, "per_customer_limit"),
        is_active: formData.get("is_active"),
      });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const id = formString(formData, "id");
    const db = createServiceClient();
    const row = { ...parsed.data, description: parsed.data.description || null };
    if (id) check(await db.from("coupons").update(row).eq("id", z.uuid().parse(id)), "coupon update");
    else check(await db.from("coupons").insert(row), "coupon insert");
    await audit(ctx, id ? "coupon.update" : "coupon.create", "coupon", id || null, {
      code: row.code,
      type: row.discount_type,
      value: row.value,
      active: row.is_active,
    });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Store settings
// ---------------------------------------------------------------------------
const httpsUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/.test(v), "https_only");

export async function saveSettings(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({
        contact_email: z.union([z.literal(""), emailSchema]),
        contact_phone: text(30),
        whatsapp: text(30),
        address_ar: text(300),
        address_en: text(300),
        instagram: httpsUrl,
        facebook: httpsUrl,
        tiktok: httpsUrl,
        youtube: httpsUrl,
        x: httpsUrl,
        announcement_ar: text(200),
        announcement_en: text(200),
        announcement_active: checkboxSchema,
        cod_enabled: checkboxSchema,
        cod_fee: moneyInputSchema,
        cod_max_total: optionalMoneyInputSchema,
        paymob_card_enabled: checkboxSchema,
        paymob_wallet_enabled: checkboxSchema,
        reservation_minutes: intInputSchema(10, 1440),
        low_stock_threshold: intInputSchema(0, 10000),
      })
      .safeParse(
        Object.fromEntries(
          [
            "contact_email", "contact_phone", "whatsapp", "address_ar", "address_en", "instagram", "facebook", "tiktok",
            "youtube", "x", "announcement_ar", "announcement_en", "announcement_active", "cod_enabled", "cod_fee",
            "cod_max_total", "paymob_card_enabled", "paymob_wallet_enabled", "reservation_minutes", "low_stock_threshold",
          ].map((k) => [k, formData.get(k) ?? ""]),
        ),
      );
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const s = parsed.data;
    const social = Object.fromEntries(
      (["instagram", "facebook", "tiktok", "youtube", "x"] as const).filter((k) => s[k]).map((k) => [k, s[k]]),
    );
    const row = {
      contact_email: s.contact_email || null,
      contact_phone: s.contact_phone || null,
      whatsapp: s.whatsapp || null,
      address_ar: s.address_ar || null,
      address_en: s.address_en || null,
      social,
      announcement_ar: s.announcement_ar || null,
      announcement_en: s.announcement_en || null,
      announcement_active: s.announcement_active,
      cod_enabled: s.cod_enabled,
      cod_fee: s.cod_fee,
      cod_max_total: s.cod_max_total,
      paymob_card_enabled: s.paymob_card_enabled,
      paymob_wallet_enabled: s.paymob_wallet_enabled,
      reservation_minutes: s.reservation_minutes,
      low_stock_threshold: s.low_stock_threshold,
    };
    check(await createServiceClient().from("store_settings").update(row).eq("id", 1), "settings");
    await audit(ctx, "settings.update", "store_settings", "1", {
      cod_enabled: s.cod_enabled,
      cod_fee: s.cod_fee,
      paymob_card_enabled: s.paymob_card_enabled,
      paymob_wallet_enabled: s.paymob_wallet_enabled,
      reservation_minutes: s.reservation_minutes,
    });
    updateTag(TAGS.settings);
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// Team / roles (administrators only; the service role is the only writer of user_roles)
// ---------------------------------------------------------------------------
async function findUserIdByEmail(email: string): Promise<string | null> {
  const db = createServiceClient();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  return null;
}

export async function grantRole(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({ email: emailSchema, role: z.enum(["admin", "staff"]) })
      .safeParse({ email: formString(formData, "email"), role: formString(formData, "role") });
    if (!parsed.success) return { ok: false, error: "validation", fields: fieldsFromIssues(parsed.error.issues) };
    const userId = await findUserIdByEmail(parsed.data.email);
    if (!userId) return { ok: false, error: "user_not_found" };
    check(
      await createServiceClient()
        .from("user_roles")
        .upsert({ user_id: userId, role: parsed.data.role, granted_by: ctx.user.id }, { onConflict: "user_id,role" }),
      "grant",
    );
    await audit(ctx, "role.grant", "user", userId, { role: parsed.data.role });
    return { ok: true };
  });
}

export async function revokeRole(formData: FormData): Promise<AdminResult> {
  return adminAction("admin", async (ctx) => {
    const parsed = z
      .object({ user_id: z.uuid(), role: z.enum(["admin", "staff"]) })
      .parse({ user_id: formString(formData, "user_id"), role: formString(formData, "role") });
    if (parsed.user_id === ctx.user.id && parsed.role === "admin") return { ok: false, error: "cannot_revoke_self" };
    check(
      await createServiceClient().from("user_roles").delete().eq("user_id", parsed.user_id).eq("role", parsed.role),
      "revoke",
    );
    await audit(ctx, "role.revoke", "user", parsed.user_id, { role: parsed.role });
    return { ok: true };
  });
}

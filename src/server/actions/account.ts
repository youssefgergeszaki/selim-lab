"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import {
  checkboxSchema,
  egyptianPhoneSchema,
  fullNameSchema,
  governorateSchema,
  optionalText,
} from "@/lib/validation/common";

export type AccountState = { status: "idle" | "saved" | "error"; fields?: string[] };

/**
 * Customer self-service mutations run with the customer's own session, so Row Level
 * Security guarantees they can only change their own profile and addresses.
 */
export async function updateProfile(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser();
  if (!user) return { status: "error" };
  const parsed = z
    .object({
      fullName: fullNameSchema,
      phone: egyptianPhoneSchema.optional().or(z.literal("").transform(() => undefined)),
      preferredLocale: z.enum(["ar", "en"]),
      marketingOptIn: checkboxSchema,
    })
    .safeParse({
      fullName: formData.get("fullName"),
      phone: formData.get("phone") ?? "",
      preferredLocale: formData.get("preferredLocale"),
      marketingOptIn: formData.get("marketingOptIn"),
    });
  if (!parsed.success) return { status: "error", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  const supabase = await createUserClient();
  if (!supabase) return { status: "error" };
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone ?? null,
      preferred_locale: parsed.data.preferredLocale,
      marketing_opt_in: parsed.data.marketingOptIn,
    })
    .eq("id", user.id);
  if (error) return { status: "error" };
  revalidatePath("/[locale]/account", "layout");
  return { status: "saved" };
}

const addressSchema = z.object({
  label: optionalText(60),
  fullName: fullNameSchema,
  phone: egyptianPhoneSchema,
  governorate: governorateSchema,
  city: z.string().trim().min(2).max(80),
  addressLine: z.string().trim().min(5).max(300),
  notes: optionalText(300),
  isDefault: checkboxSchema,
});

export async function addAddress(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await getSessionUser();
  if (!user) return { status: "error" };
  const parsed = addressSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  const supabase = await createUserClient();
  if (!supabase) return { status: "error" };
  const { count } = await supabase.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count ?? 0) >= 10) return { status: "error" };
  const makeDefault = parsed.data.isDefault || (count ?? 0) === 0;
  if (makeDefault) await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  const { error } = await supabase.from("addresses").insert({
    user_id: user.id,
    label: parsed.data.label ?? null,
    full_name: parsed.data.fullName,
    phone: parsed.data.phone,
    governorate: parsed.data.governorate,
    city: parsed.data.city,
    address_line: parsed.data.addressLine,
    notes: parsed.data.notes ?? null,
    is_default: makeDefault,
  });
  if (error) return { status: "error" };
  revalidatePath("/[locale]/account", "layout");
  return { status: "saved" };
}

export async function deleteAddress(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  const supabase = await createUserClient();
  if (!id.success || !supabase) return;
  await supabase.from("addresses").delete().eq("id", id.data);
  revalidatePath("/[locale]/account", "layout");
}

export async function setDefaultAddress(formData: FormData): Promise<void> {
  const id = z.uuid().safeParse(formData.get("id"));
  const user = await getSessionUser();
  const supabase = await createUserClient();
  if (!id.success || !supabase || !user) return;
  await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
  await supabase.from("addresses").update({ is_default: true }).eq("id", id.data);
  revalidatePath("/[locale]/account", "layout");
}

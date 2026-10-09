"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { localizePath, type Locale } from "@/i18n/config";
import { siteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { safeNextPath } from "@/lib/security/redirect";
import { createUserClient } from "@/lib/supabase/server";
import { emailSchema, fullNameSchema } from "@/lib/validation/common";
import { mergeGuestCart } from "@/server/cart";

export type AuthState = {
  status: "idle" | "error" | "success";
  message?:
    | "invalid_credentials"
    | "email_not_confirmed"
    | "validation"
    | "password_mismatch"
    | "rate_limited"
    | "unavailable"
    | "check_email"
    | "reset_sent"
    | "password_updated"
    | "link_invalid"
    | "generic";
  fields?: string[];
};

const localeSchema = z.enum(["ar", "en"]);
const passwordSchema = z.string().min(8).max(72);

function issuesToFields(error: z.ZodError): string[] {
  return [...new Set(error.issues.map((i) => String(i.path[0])))];
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1).max(72), locale: localeSchema })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), locale: formData.get("locale") });
  if (!parsed.success) return { status: "error", message: "validation", fields: issuesToFields(parsed.error) };
  if (!(await rateLimit(RATE_LIMITS.auth))) return { status: "error", message: "rate_limited" };
  const supabase = await createUserClient();
  if (!supabase) return { status: "error", message: "unavailable" };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error || !data.user) {
    if (error?.code === "email_not_confirmed") return { status: "error", message: "email_not_confirmed" };
    return { status: "error", message: "invalid_credentials" };
  }
  await mergeGuestCart(data.user.id).catch((e) => logger.warn("auth.merge_cart_failed", { error: String(e) }));
  redirect(safeNextPath(formData.get("next"), parsed.data.locale));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      fullName: fullNameSchema,
      email: emailSchema,
      password: passwordSchema,
      confirm: z.string(),
      locale: localeSchema,
    })
    .safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      password: formData.get("password"),
      confirm: formData.get("confirm"),
      locale: formData.get("locale"),
    });
  if (!parsed.success) return { status: "error", message: "validation", fields: issuesToFields(parsed.error) };
  if (parsed.data.password !== parsed.data.confirm) return { status: "error", message: "password_mismatch", fields: ["confirm"] };
  if (!(await rateLimit(RATE_LIMITS.auth))) return { status: "error", message: "rate_limited" };
  const supabase = await createUserClient();
  if (!supabase) return { status: "error", message: "unavailable" };

  const next = safeNextPath(formData.get("next"), parsed.data.locale);
  // Role assignment never happens here: user_roles is writable only by the service role.
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
      data: { full_name: parsed.data.fullName, locale: parsed.data.locale },
    },
  });
  if (error) {
    logger.warn("auth.signup_failed", { code: error.code ?? null });
    if (error.code === "weak_password") return { status: "error", message: "validation", fields: ["password"] };
    // Don't reveal whether the email already exists.
    return { status: "success", message: "check_email" };
  }
  if (data.session && data.user) {
    await mergeGuestCart(data.user.id).catch(() => undefined);
    redirect(next);
  }
  return { status: "success", message: "check_email" };
}

export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ email: emailSchema, locale: localeSchema })
    .safeParse({ email: formData.get("email"), locale: formData.get("locale") });
  if (!parsed.success) return { status: "error", message: "validation", fields: ["email"] };
  if (!(await rateLimit(RATE_LIMITS.auth))) return { status: "error", message: "rate_limited" };
  const supabase = await createUserClient();
  if (!supabase) return { status: "error", message: "unavailable" };
  const next = localizePath(parsed.data.locale, "/account/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`,
  });
  if (error) logger.warn("auth.reset_request_failed", { code: error.code ?? null });
  // Same response whether or not the account exists.
  return { status: "success", message: "reset_sent" };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ password: passwordSchema, confirm: z.string(), locale: localeSchema })
    .safeParse({ password: formData.get("password"), confirm: formData.get("confirm"), locale: formData.get("locale") });
  if (!parsed.success) return { status: "error", message: "validation", fields: issuesToFields(parsed.error) };
  if (parsed.data.password !== parsed.data.confirm) return { status: "error", message: "password_mismatch", fields: ["confirm"] };
  const supabase = await createUserClient();
  if (!supabase) return { status: "error", message: "unavailable" };
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { status: "error", message: "link_invalid" };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password") {
      return { status: "error", message: "validation", fields: ["password"] };
    }
    return { status: "error", message: "generic" };
  }
  return { status: "success", message: "password_updated" };
}

export async function signOut(formData: FormData): Promise<void> {
  const locale: Locale = formData.get("locale") === "en" ? "en" : "ar";
  const supabase = await createUserClient();
  await supabase?.auth.signOut();
  redirect(localizePath(locale, "/"));
}

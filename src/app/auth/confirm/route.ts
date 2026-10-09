import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { defaultLocale, LOCALE_COOKIE, isLocale, localeFromPathname, localizePath } from "@/i18n/config";
import { safeNextPath } from "@/lib/security/redirect";
import { createUserClient } from "@/lib/supabase/server";
import { mergeGuestCart } from "@/server/cart";

export const dynamic = "force-dynamic";

const OTP_TYPES: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

/**
 * Handles links from Supabase Auth emails (sign-up confirmation, password recovery).
 * Supports both the token_hash template and the PKCE `code` flow.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const rawNext = params.get("next");
  const locale = localeFromPathname(rawNext ?? "") ?? (isLocale(cookieLocale) ? cookieLocale : defaultLocale);
  const next = safeNextPath(rawNext, locale);
  const failure = new URL(`${localizePath(locale, "/account/login")}?error=link_invalid`, request.url);

  const supabase = await createUserClient();
  if (!supabase) return NextResponse.redirect(failure);

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");

  let userId: string | null = null;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return NextResponse.redirect(failure);
    userId = data.user?.id ?? null;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(failure);
    userId = data.user?.id ?? null;
  } else {
    return NextResponse.redirect(failure);
  }

  if (userId) await mergeGuestCart(userId).catch(() => undefined);
  return NextResponse.redirect(new URL(next, request.url));
}

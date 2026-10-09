import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { decideLocaleRouting, LOCALE_COOKIE } from "@/i18n/config";

/**
 * Runs before every page request:
 * 1. Locale routing — "/" goes to "/ar"; unprefixed paths get a locale prefix.
 * 2. Supabase session refresh — keeps auth cookies fresh for Server Components.
 *
 * Authorization is NOT decided here. Every protected page, action and route handler
 * verifies the user and role on the server.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = decideLocaleRouting(pathname, search, request.cookies.get(LOCALE_COOKIE)?.value);

  if (decision.action === "redirect") {
    return NextResponse.redirect(new URL(decision.location, request.url));
  }

  // Expose the resolved locale to server components that don't receive params (e.g. not-found).
  const requestHeaders = new Headers(request.headers);
  if (decision.locale) requestHeaders.set("x-sl-locale", decision.locale);
  else requestHeaders.delete("x-sl-locale");
  const forward = () => NextResponse.next({ request: { headers: requestHeaders } });

  let response = forward();

  // Remember the visitor's language so unprefixed links (e.g. /shop) land in the right locale.
  if (decision.locale && request.cookies.get(LOCALE_COOKIE)?.value !== decision.locale) {
    response.cookies.set(LOCALE_COOKIE, decision.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || pathname.startsWith("/api/")) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        requestHeaders.set("cookie", request.cookies.toString());
        const localeCookie = response.cookies.get(LOCALE_COOKIE);
        response = forward();
        if (localeCookie) response.cookies.set(localeCookie);
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [hKey, hValue] of Object.entries(headers ?? {})) response.headers.set(hKey, hValue);
      },
    },
  });

  // Validates the JWT and refreshes an expiring session. Do not remove.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|woff2?)$).*)",
  ],
};

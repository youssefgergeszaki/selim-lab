import { z } from "zod";

/**
 * Environment access. Values are read lazily so that the app can build and render
 * friendly "not configured" states before credentials are supplied.
 *
 * Public (exposed to the browser): NEXT_PUBLIC_*
 * Server-only: everything else. Never import server values into Client Components.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20).optional(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export function getPublicEnv(): PublicEnv {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  });
  if (!parsed.success) {
    // Fall back to safe defaults; misconfiguration is reported by isSupabaseConfigured().
    return { NEXT_PUBLIC_SITE_URL: "http://localhost:3000" };
  }
  return parsed.data;
}

export function siteUrl(): string {
  return getPublicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
}

export function isSupabaseConfigured(): boolean {
  const env = getPublicEnv();
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isServiceRoleConfigured(): boolean {
  return isSupabaseConfigured() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

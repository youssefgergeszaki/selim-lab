import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getPublicEnv, isServiceRoleConfigured, isSupabaseConfigured } from "@/lib/env";

/**
 * Request-scoped client that acts as the signed-in user (RLS applies).
 * Create a new one per request; never share between requests.
 */
export async function createUserClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  const env = getPublicEnv();
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component where cookies are read-only.
          // The proxy refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Cookie-less anonymous client for public catalogue reads (RLS applies as `anon`).
 */
let publicClient: SupabaseClient | null = null;
export function createPublicClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!publicClient) {
    const env = getPublicEnv();
    publicClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return publicClient;
}

/**
 * Privileged client using the service role (bypasses RLS). Server-only: use it only after
 * authorization has been verified on the server, or for system tasks (webhooks, checkout).
 */
let serviceClient: SupabaseClient | null = null;
export function createServiceClient(): SupabaseClient {
  if (!isServiceRoleConfigured()) {
    throw new Error("Supabase service role is not configured");
  }
  if (!serviceClient) {
    const env = getPublicEnv();
    serviceClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return serviceClient;
}

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import { createServiceClient, createUserClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/env";

export type AppRole = "admin" | "staff";

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
}

/** The verified signed-in user for this request, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createUserClient();
  if (!supabase) return null;
  // getUser() validates the session with the Supabase Auth server.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = (data.user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    fullName: typeof meta.full_name === "string" ? meta.full_name : null,
  };
});

/** Roles are read with the service role so they cannot be spoofed by client data. */
export const getUserRoles = cache(async (userId: string): Promise<AppRole[]> => {
  if (!isServiceRoleConfigured()) return [];
  const { data, error } = await createServiceClient()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((row) => row.role as AppRole);
});

export function isStaffRole(roles: AppRole[]): boolean {
  return roles.includes("admin") || roles.includes("staff");
}

export async function requireUser(locale: Locale, next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const target = localizePath(locale, "/account/login");
    redirect(next ? `${target}?next=${encodeURIComponent(next)}` : target);
  }
  return user;
}

export class AuthorizationError extends Error {
  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export interface StaffContext {
  user: SessionUser;
  roles: AppRole[];
  isAdmin: boolean;
}

/**
 * Server-side authorization for dashboard pages and actions.
 * `minimum: "admin"` restricts to administrators; "staff" allows admins and staff.
 */
export async function getStaffContext(minimum: AppRole = "staff"): Promise<StaffContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const roles = await getUserRoles(user.id);
  const allowed = minimum === "admin" ? roles.includes("admin") : isStaffRole(roles);
  if (!allowed) return null;
  return { user, roles, isAdmin: roles.includes("admin") };
}

/** For Server Actions / Route Handlers: throws instead of redirecting. */
export async function assertStaff(minimum: AppRole = "staff"): Promise<StaffContext> {
  const ctx = await getStaffContext(minimum);
  if (!ctx) throw new AuthorizationError();
  return ctx;
}

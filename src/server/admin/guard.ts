import "server-only";
import { notFound } from "next/navigation";
import { AuthorizationError, assertStaff, getStaffContext, type AppRole, type StaffContext } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/server";
import { validateImageUpload, storagePathFor } from "@/lib/security/upload";
import type { Bucket } from "@/lib/storage";

export type AdminResult = { ok: true; message?: string; id?: string } | { ok: false; error: string; fields?: string[] };

/**
 * Wraps every dashboard mutation: verifies the session and role on the server first,
 * then runs the mutation and converts failures into safe, non-leaky results.
 */
export async function adminAction(
  minimum: AppRole,
  run: (ctx: StaffContext) => Promise<AdminResult>,
): Promise<AdminResult> {
  if (!isServiceRoleConfigured()) return { ok: false, error: "not_configured" };
  let ctx: StaffContext;
  try {
    ctx = await assertStaff(minimum);
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, error: "forbidden" };
    throw error;
  }
  try {
    return await run(ctx);
  } catch (error) {
    logger.error("admin.action_failed", { error: String(error) });
    const message = error instanceof Error ? error.message : "";
    const code = message.match(/SL_[A-Z_]+|upload_[a-z_]+|\b(?:duplicate|in_use|user_not_found|cannot_revoke_self|no_variants)\b/)?.[0];
    return { ok: false, error: code ?? "error" };
  }
}

export function fieldsFromIssues(issues: { path: PropertyKey[] }[]): string[] {
  return [...new Set(issues.map((i) => String(i.path[0])))];
}

/** Validates and stores an uploaded image; returns the storage path. */
export async function uploadImage(bucket: Bucket, prefix: string, file: File | null): Promise<string | null> {
  if (!file || file.size === 0) return null;
  const check = await validateImageUpload(file);
  if (!check.ok) throw new Error(`upload_${check.reason}`);
  const path = storagePathFor(prefix, check.ext);
  const { error } = await createServiceClient()
    .storage.from(bucket)
    .upload(path, check.bytes, { contentType: check.mime, cacheControl: "31536000", upsert: false });
  if (error) throw new Error(`upload_failed: ${error.message}`);
  return path;
}

export async function removeImage(bucket: Bucket, path: string | null | undefined) {
  if (!path) return;
  await createServiceClient().storage.from(bucket).remove([path]);
}

export function formFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** Throws a mapped error for a failed Supabase/PostgREST call. */
export function check<T extends { error: { code?: string; message: string } | null }>(result: T, label: string): T {
  if (result.error) {
    if (result.error.code === "23505") throw new Error("duplicate");
    if (result.error.code === "23503") throw new Error("in_use");
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result;
}

/**
 * For dashboard pages: re-checks authorization in the page itself (defence in depth,
 * independent of the layout). Unauthorised visitors get a 404.
 */
export async function requireStaffPage(minimum: AppRole = "staff"): Promise<StaffContext> {
  const ctx = await getStaffContext(minimum);
  if (!ctx) notFound();
  return ctx;
}

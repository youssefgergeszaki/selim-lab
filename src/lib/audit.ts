import "server-only";
import { logger } from "@/lib/logger";
import { clientIp } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import type { StaffContext } from "@/lib/auth";

/**
 * Records an administrative action. Metadata must not contain secrets or full customer data;
 * keep it to identifiers and changed field names/values relevant for accountability.
 */
export async function audit(
  ctx: StaffContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await createServiceClient().from("audit_logs").insert({
      actor_id: ctx.user.id,
      actor_email: ctx.user.email,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
      ip_address: await clientIp(),
    });
  } catch (error) {
    logger.error("audit.write_failed", { action, error: String(error) });
  }
}

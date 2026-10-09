"use server";

import { z } from "zod";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation/common";

export type NewsletterState = { status: "idle" | "success" | "invalid" | "error" | "rate_limited" };

const schema = z.object({
  email: emailSchema,
  locale: z.enum(["ar", "en"]),
  source: z.string().max(30).regex(/^[a-z-]+$/).optional(),
  // Honeypot: real visitors never fill this hidden field.
  company: z.string().max(0).optional().or(z.literal("")),
});

export async function subscribeNewsletter(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    locale: formData.get("locale"),
    source: formData.get("source") || undefined,
    company: formData.get("company") ?? "",
  });
  if (!parsed.success) {
    // A filled honeypot is treated as success to avoid tipping off bots.
    if (formData.get("company")) return { status: "success" };
    return { status: "invalid" };
  }
  if (!(await rateLimit(RATE_LIMITS.newsletter))) return { status: "rate_limited" };
  if (!isServiceRoleConfigured()) return { status: "error" };

  const { error } = await createServiceClient()
    .from("newsletter_subscribers")
    .upsert(
      { email: parsed.data.email, locale: parsed.data.locale, source: parsed.data.source ?? null, status: "subscribed" },
      { onConflict: "email" },
    );
  if (error) {
    logger.error("newsletter.subscribe_failed", { code: error.code });
    return { status: "error" };
  }
  return { status: "success" };
}

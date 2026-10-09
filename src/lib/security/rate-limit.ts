import "server-only";
import { headers } from "next/headers";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/server";
import { sha256 } from "./tokens";

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

export interface RateLimitRule {
  name: string;
  max: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  checkout: { name: "checkout", max: 8, windowSeconds: 600 },
  payment: { name: "payment", max: 10, windowSeconds: 600 },
  coupon: { name: "coupon", max: 15, windowSeconds: 600 },
  newsletter: { name: "newsletter", max: 5, windowSeconds: 3600 },
  auth: { name: "auth", max: 10, windowSeconds: 600 },
  review: { name: "review", max: 5, windowSeconds: 3600 },
  cart: { name: "cart", max: 120, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window limiter stored in Postgres so it holds across serverless instances.
 * Identifiers are hashed; raw IPs are not stored. Fails open if the store is unavailable
 * (logged), so an infrastructure hiccup never blocks legitimate checkouts.
 */
export async function rateLimit(rule: RateLimitRule, identifier?: string): Promise<boolean> {
  if (!isServiceRoleConfigured()) return true;
  const id = identifier ?? (await clientIp());
  const key = `${rule.name}:${sha256(id).slice(0, 32)}`;
  try {
    const { data, error } = await createServiceClient().rpc("rate_limit_hit", {
      p_key: key,
      p_window_seconds: rule.windowSeconds,
      p_max: rule.max,
    });
    if (error) throw error;
    return data === true;
  } catch (error) {
    logger.warn("rate_limit.unavailable", { rule: rule.name, error: String(error) });
    return true;
  }
}

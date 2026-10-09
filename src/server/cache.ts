import "server-only";
import { unstable_cache } from "next/cache";

/** Cache tags for public content, invalidated by dashboard mutations. */
export const TAGS = {
  catalog: "catalog",
  content: "content",
  settings: "settings",
  shipping: "shipping",
} as const;

export type CacheTag = (typeof TAGS)[keyof typeof TAGS];

/**
 * Caches a public (non-personalised) data loader. Disabled in tests and when the data layer
 * isn't configured, so errors are never cached.
 */
export function cachedPublic<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  keyParts: string[],
  tags: CacheTag[],
  revalidate = 60,
): (...args: Args) => Promise<R> {
  if (process.env.VITEST) return fn;
  return unstable_cache(fn, keyParts, { tags, revalidate });
}

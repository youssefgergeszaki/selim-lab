export const STORE_TIME_ZONE = "Africa/Cairo";

/** Offset (ms) of a time zone from UTC at a given instant. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - instant;
}

/**
 * Converts an <input type="datetime-local"> value ("2026-11-01T09:00"), entered in store time
 * (Cairo), to an ISO UTC timestamp. Returns null for empty/invalid input.
 */
export function storeLocalToIso(value: string, timeZone = STORE_TIME_ZONE): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const first = guess - zoneOffset(guess, timeZone);
  const corrected = guess - zoneOffset(first, timeZone);
  return new Date(corrected).toISOString();
}

/** ISO timestamp -> "YYYY-MM-DDTHH:mm" in store time, for datetime-local inputs. */
export function isoToStoreLocal(iso: string | null | undefined, timeZone = STORE_TIME_ZONE): string {
  if (!iso) return "";
  const instant = new Date(iso).getTime();
  if (Number.isNaN(instant)) return "";
  const local = new Date(instant + zoneOffset(instant, timeZone));
  return local.toISOString().slice(0, 16);
}

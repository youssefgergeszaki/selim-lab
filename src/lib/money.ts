import { intlLocale, type Locale } from "@/i18n/config";

/**
 * Money is handled as integer piasters (1 EGP = 100 piasters) in application code to avoid
 * floating-point errors. The database stores numeric(12,2) EGP values.
 */
export type Piasters = number;

export const CURRENCY = "EGP" as const;

/** Parse a numeric(12,2) value returned by PostgREST (number or string) into piasters. */
export function toPiasters(value: number | string | null | undefined): Piasters {
  if (value === null || value === undefined || value === "") return 0;
  const str = typeof value === "number" ? value.toFixed(2) : value.trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid money value: ${String(value)}`);
  }
  const negative = str.startsWith("-");
  const [whole, fraction = ""] = str.replace("-", "").split(".");
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt((fraction + "00").slice(0, 2), 10);
  return negative ? -cents : cents;
}

/** Convert piasters into a numeric string suitable for numeric(12,2) columns. */
export function toDecimalString(piasters: Piasters): string {
  if (!Number.isInteger(piasters)) throw new Error("Piasters must be an integer");
  const negative = piasters < 0;
  const abs = Math.abs(piasters);
  const str = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${str}` : str;
}

export function formatMoney(piasters: Piasters, locale: Locale): string {
  const amount = piasters / 100;
  const hasFraction = piasters % 100 !== 0;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

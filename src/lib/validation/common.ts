import { z } from "zod";
import { governorateCodes } from "@/lib/governorates";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

/** Converts Arabic-Indic digits to ASCII digits. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : EASTERN_ARABIC_INDIC.indexOf(d));
  });
}

/**
 * Normalises Egyptian mobile numbers to the local 11-digit form (01XXXXXXXXX).
 * Accepts +20 / 0020 prefixes, spaces, dashes and Arabic-Indic digits.
 */
export function normalizeEgyptianPhone(raw: string): string | null {
  let digits = toAsciiDigits(raw).replace(/[\s\-().]/g, "");
  if (digits.startsWith("+20")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("0020")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("20") && digits.length === 12) digits = `0${digits.slice(2)}`;
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

/** Converts a local Egyptian mobile number to E.164 (+20…), as payment providers expect. */
export function toE164Egypt(local: string): string {
  return `+20${local.slice(1)}`;
}

export const egyptianPhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeEgyptianPhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "invalid_phone" });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const governorateSchema = z.enum(governorateCodes);

export const fullNameSchema = z.string().trim().min(2).max(120);

/** Strips control characters (keeps newlines/tabs) from free text. */
export function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform(cleanText)
    .optional()
    .or(z.literal("").transform(() => undefined));

export const uuidSchema = z.uuid();

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "invalid_slug")
  .max(100);

/** Product slugs may contain Arabic letters for localized URLs. */
export const localizedSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[^\s/?#%]+$/u, "invalid_slug");

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, "") // Arabic diacritics
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/** EGP amount entered in a form ("350", "350.5", "1,200.00") → numeric string with 2 decimals. */
export const moneyInputSchema = z
  .string()
  .trim()
  .transform((v) => toAsciiDigits(v).replace(/,/g, ""))
  .refine((v) => /^\d{1,9}(\.\d{1,2})?$/.test(v), "invalid_amount")
  .transform((v) => Number.parseFloat(v).toFixed(2));

export const optionalMoneyInputSchema = z
  .string()
  .trim()
  .transform((v) => toAsciiDigits(v).replace(/,/g, ""))
  .refine((v) => v === "" || /^\d{1,9}(\.\d{1,2})?$/.test(v), "invalid_amount")
  .transform((v) => (v === "" ? null : Number.parseFloat(v).toFixed(2)));

export const intInputSchema = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((v) => toAsciiDigits(v))
    .refine((v) => /^-?\d+$/.test(v), "invalid_number")
    .transform((v) => Number.parseInt(v, 10))
    .refine((v) => v >= min && v <= max, "out_of_range");

export const checkboxSchema = z
  .union([z.literal("on"), z.literal("true"), z.literal("1"), z.literal(""), z.undefined(), z.null()])
  .transform((v) => v === "on" || v === "true" || v === "1");

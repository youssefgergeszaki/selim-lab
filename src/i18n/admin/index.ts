import type { Locale } from "../config";
import { adminAr } from "./ar";
import { adminEn, type AdminDictionary } from "./en";

export type { AdminDictionary };

export function getAdminDictionary(locale: Locale): AdminDictionary {
  return locale === "ar" ? adminAr : adminEn;
}

import { describe, expect, it } from "vitest";
import { decideLocaleRouting, getDirection, isLocale, localizePath, switchLocalePath } from "@/i18n/config";
import { ar } from "@/i18n/dictionaries/ar";
import { en } from "@/i18n/dictionaries/en";
import { adminAr } from "@/i18n/admin/ar";
import { adminEn } from "@/i18n/admin/en";
import { pick, t } from "@/i18n";

function keyPaths(obj: unknown, prefix = ""): string[] {
  if (Array.isArray(obj)) return obj.flatMap((v, i) => keyPaths(v, `${prefix}[${i}]`));
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

describe("locale routing", () => {
  it("redirects the root URL to Arabic", () => {
    expect(decideLocaleRouting("/", "", null)).toEqual({ action: "redirect", location: "/ar" });
  });

  it("keeps the root on Arabic even if English was used before", () => {
    expect(decideLocaleRouting("/", "", "en")).toEqual({ action: "redirect", location: "/ar" });
  });

  it("prefixes unlocalized paths with the saved locale (Arabic by default) and keeps the query", () => {
    expect(decideLocaleRouting("/shop", "?q=serum", null)).toEqual({ action: "redirect", location: "/ar/shop?q=serum" });
    expect(decideLocaleRouting("/shop", "", "en")).toEqual({ action: "redirect", location: "/en/shop" });
  });

  it("passes localized, API, auth and asset paths through", () => {
    expect(decideLocaleRouting("/en/products/x", "", null)).toEqual({ action: "next", locale: "en" });
    expect(decideLocaleRouting("/ar", "", null)).toEqual({ action: "next", locale: "ar" });
    expect(decideLocaleRouting("/api/paymob/webhook", "", null).action).toBe("next");
    expect(decideLocaleRouting("/auth/confirm", "", null).action).toBe("next");
    expect(decideLocaleRouting("/brand/selim-lab-logo.png", "", null).action).toBe("next");
    expect(decideLocaleRouting("/sitemap.xml", "", null).action).toBe("next");
  });

  it("does not treat lookalike prefixes as locales", () => {
    expect(decideLocaleRouting("/arabic", "", null)).toEqual({ action: "redirect", location: "/ar/arabic" });
    expect(isLocale("fr")).toBe(false);
  });
});

describe("direction and paths", () => {
  it("uses RTL for Arabic and LTR for English", () => {
    expect(getDirection("ar")).toBe("rtl");
    expect(getDirection("en")).toBe("ltr");
  });

  it("switches language while preserving the page", () => {
    expect(switchLocalePath("/ar/shop", "en")).toBe("/en/shop");
    expect(switchLocalePath("/en/products/serum", "ar")).toBe("/ar/products/serum");
    expect(switchLocalePath("/ar", "en")).toBe("/en");
  });

  it("localizes paths", () => {
    expect(localizePath("ar", "/")).toBe("/ar");
    expect(localizePath("en", "/cart")).toBe("/en/cart");
  });
});

describe("dictionaries", () => {
  it("Arabic and English storefront dictionaries have identical keys", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(ar).sort());
  });

  it("Arabic and English dashboard dictionaries have identical keys", () => {
    expect(keyPaths(adminEn).sort()).toEqual(keyPaths(adminAr).sort());
  });

  it("has no empty strings", () => {
    for (const dict of [ar, en, adminAr, adminEn]) {
      const empty = keyPaths(dict).filter((path) => {
        const value = path
          .replace(/\[(\d+)\]/g, ".$1")
          .split(".")
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], dict);
        return typeof value === "string" && value.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });

  it("interpolates and picks localized values with fallback", () => {
    expect(t("Only {count} left", { count: 2 })).toBe("Only 2 left");
    expect(pick("ar", "عربي", "English")).toBe("عربي");
    expect(pick("ar", "", "English")).toBe("English");
    expect(pick("en", "عربي", null)).toBe("عربي");
  });
});

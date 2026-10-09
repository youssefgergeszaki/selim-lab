import { expect, test } from "@playwright/test";

test.describe("Arabic-first routing and direction", () => {
  test("root redirects to /ar with RTL markup", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/ar$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("English pages render LTR", async ({ page }) => {
    await page.goto("/en/shop");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("unprefixed paths get a locale prefix and keep the query", async ({ page }) => {
    await page.goto("/shop?q=test");
    await expect(page).toHaveURL(/\/ar\/shop\?q=test$/);
  });

  test("language switcher keeps the current page", async ({ page, isMobile }) => {
    test.skip(isMobile, "Switcher lives in the menu on mobile");
    await page.goto("/ar/shop");
    await page.getByRole("link", { name: "التبديل إلى الإنجليزية" }).click();
    await expect(page).toHaveURL(/\/en\/shop$/);
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  });

  test("private pages are not indexable", async ({ page }) => {
    await page.goto("/ar/cart");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });

  test("dashboard is not reachable without signing in", async ({ page }) => {
    await page.goto("/en/admin");
    await expect(page).toHaveURL(/\/en\/account\/login/);
  });

  test("unknown localized pages show the localized 404", async ({ page }) => {
    const response = await page.goto("/ar/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("الصفحة غير موجودة")).toBeVisible();
  });

  test("shop lists products or the empty state", async ({ page }) => {
    await page.goto("/en/shop");
    const products = page.locator("article");
    const empty = page.getByText(/being prepared|No matching products/);
    await expect(products.first().or(empty)).toBeVisible();
  });

  for (const path of ["/ar", "/en", "/ar/shop", "/ar/cart", "/ar/account/login"]) {
    test(`no horizontal overflow at 360px on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

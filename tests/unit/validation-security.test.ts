import { describe, expect, it } from "vitest";
import { checkoutSchema } from "@/lib/validation/checkout";
import { normalizeEgyptianPhone, slugify, toAsciiDigits } from "@/lib/validation/common";
import { safeNextPath } from "@/lib/security/redirect";
import { generateOrderReference, randomToken, safeEqual, sha256 } from "@/lib/security/tokens";
import { storagePathFor, validateImageUpload } from "@/lib/security/upload";
import { redact } from "@/lib/logger";
import { normalizeSearch, sanitizeSearchTerm } from "@/server/catalog";
import { isoToStoreLocal, storeLocalToIso } from "@/lib/dates";

const validCheckout = {
  idempotencyKey: "abcdefghijklmnopqrstuvwx",
  locale: "ar",
  fullName: "أحمد محمد",
  email: "Guest@Example.com",
  phone: "+20 101 234 5678",
  governorate: "cairo",
  city: "مدينة نصر",
  addressLine: "شارع عباس العقاد عمارة 10",
  notes: "",
  shippingRateId: "00000000-0000-4000-8000-000000000001",
  paymentMethod: "paymob_card",
  saveAddress: undefined,
};

describe("checkout validation", () => {
  it("normalizes contact data", () => {
    const parsed = checkoutSchema.parse(validCheckout);
    expect(parsed.email).toBe("guest@example.com");
    expect(parsed.phone).toBe("01012345678");
  });

  it("strips client-supplied prices and totals (they are never trusted)", () => {
    const parsed = checkoutSchema.parse({ ...validCheckout, total: "1", unitPrice: "0.01", subtotal: "0" });
    expect(parsed).not.toHaveProperty("total");
    expect(parsed).not.toHaveProperty("unitPrice");
    expect(parsed).not.toHaveProperty("subtotal");
  });

  it.each([
    ["phone", "12345"],
    ["governorate", "atlantis"],
    ["paymentMethod", "free"],
    ["email", "not-an-email"],
    ["shippingRateId", "1 OR 1=1"],
    ["idempotencyKey", "short"],
  ])("rejects invalid %s", (field, value) => {
    expect(checkoutSchema.safeParse({ ...validCheckout, [field]: value }).success).toBe(false);
  });
});

describe("Egyptian phone numbers", () => {
  it.each([
    ["01012345678", "01012345678"],
    ["+201112345678", "01112345678"],
    ["00201212345678", "01212345678"],
    ["٠١٥١٢٣٤٥٦٧٨", "01512345678"],
    ["0101 234-5678", "01012345678"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeEgyptianPhone(input)).toBe(expected);
  });

  it.each(["0131234567", "0101234567", "02123456789", "abc"])("rejects %s", (input) => {
    expect(normalizeEgyptianPhone(input)).toBeNull();
  });

  it("converts Arabic-Indic digits", () => {
    expect(toAsciiDigits("٣٥٠")).toBe("350");
  });
});

describe("open-redirect protection", () => {
  it("allows same-site paths only", () => {
    expect(safeNextPath("/ar/checkout", "ar")).toBe("/ar/checkout");
    expect(safeNextPath("//evil.com", "ar")).toBe("/ar/account");
    expect(safeNextPath("https://evil.com", "en")).toBe("/en/account");
    expect(safeNextPath("/\\evil.com", "en")).toBe("/en/account");
    expect(safeNextPath(undefined, "en")).toBe("/en/account");
  });
});

describe("tokens and references", () => {
  it("creates non-sequential order references in the expected format", () => {
    const refs = new Set(Array.from({ length: 200 }, () => generateOrderReference(new Date("2026-10-09T10:00:00Z"))));
    expect(refs.size).toBe(200);
    for (const ref of refs) expect(ref).toMatch(/^SL-261009-[A-HJ-NP-Z2-9]{6}$/);
  });

  it("creates high-entropy tokens and compares hashes in constant time", () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(safeEqual(sha256(token), sha256(token))).toBe(true);
    expect(safeEqual(sha256(token), sha256(`${token}x`))).toBe(false);
  });
});

describe("image upload validation", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  it("accepts real images", async () => {
    const result = await validateImageUpload(new File([png], "a.png", { type: "image/png" }));
    expect(result).toMatchObject({ ok: true, ext: "png" });
  });

  it("rejects disguised files, SVG and oversized uploads", async () => {
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    expect(await validateImageUpload(new File([html], "x.png", { type: "image/png" }))).toMatchObject({ ok: false, reason: "signature_mismatch" });
    expect(await validateImageUpload(new File([html], "x.svg", { type: "image/svg+xml" }))).toMatchObject({ ok: false, reason: "unsupported_type" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    expect(await validateImageUpload(new File([big], "big.png", { type: "image/png" }))).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("never uses the uploaded file name in storage paths", () => {
    expect(storagePathFor("products/../../etc", "png")).toMatch(/^products\/etc\/[0-9a-f-]{36}\.png$/);
  });
});

describe("misc security helpers", () => {
  it("redacts secrets and personal data from logs", () => {
    expect(redact({ api_key: "x", nested: { email: "a@b.c", ok: 1 }, card_pan: "4111" })).toEqual({
      api_key: "[redacted]",
      nested: { email: "[redacted]", ok: 1 },
      card_pan: "[redacted]",
    });
  });

  it("sanitizes search input and normalizes Arabic", () => {
    expect(sanitizeSearchTerm("serum%,(or)*")).toBe("serum or");
    expect(normalizeSearch("مدرسة إيمان على")).toBe("مدرسه ايمان علي");
  });

  it("slugifies Arabic and English names", () => {
    expect(slugify("Hydrating Serum 30ml")).toBe("hydrating-serum-30ml");
    expect(slugify("سيروم مُرطِّب")).toBe("سيروم-مرطب");
  });

  it("converts dashboard dates from Cairo time", () => {
    const iso = storeLocalToIso("2026-01-15T10:00");
    expect(iso).toBe("2026-01-15T08:00:00.000Z");
    expect(isoToStoreLocal(iso)).toBe("2026-01-15T10:00");
    expect(storeLocalToIso("bad")).toBeNull();
  });
});

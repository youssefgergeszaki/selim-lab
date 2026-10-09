import { describe, expect, it } from "vitest";
import { allocateDiscount, computeDiscount, computeTotals, type AppliedCoupon } from "@/lib/commerce/pricing";
import { formatMoney, toDecimalString, toPiasters } from "@/lib/money";

const lines = [
  { variantId: "a", quantity: 2, unitPrice: 35000 }, // 2 × 350.00
  { variantId: "b", quantity: 1, unitPrice: 52050 }, // 1 × 520.50
];
const pct = (value: number, maxDiscount: number | null = null): AppliedCoupon => ({
  id: "c",
  code: "PCT",
  discountType: "percentage",
  value,
  maxDiscount,
});

describe("money", () => {
  it("parses numeric(12,2) values exactly", () => {
    expect(toPiasters("520.50")).toBe(52050);
    expect(toPiasters(0.1 + 0.2)).toBe(30);
    expect(toPiasters("1")).toBe(100);
    expect(toPiasters("19.9")).toBe(1990);
    expect(() => toPiasters("abc")).toThrow();
  });

  it("round-trips to decimal strings", () => {
    expect(toDecimalString(52050)).toBe("520.50");
    expect(toDecimalString(5)).toBe("0.05");
    expect(toDecimalString(toPiasters("1234.56"))).toBe("1234.56");
  });

  it("formats EGP in both locales with Latin digits", () => {
    expect(formatMoney(35000, "en")).toContain("350");
    expect(formatMoney(35000, "ar")).toContain("350");
    expect(formatMoney(52050, "en")).toContain("520.50");
  });
});

describe("server-side pricing", () => {
  it("computes the subtotal from trusted unit prices", () => {
    expect(computeTotals({ lines }).subtotal).toBe(122050);
  });

  it("applies percentage discounts with rounding and caps", () => {
    expect(computeDiscount(122050, pct(10))).toBe(12205);
    expect(computeDiscount(122050, pct(10, 5000))).toBe(5000);
    expect(computeDiscount(122050, pct(150))).toBe(122050);
  });

  it("never discounts more than the subtotal for fixed coupons", () => {
    const fixed: AppliedCoupon = { id: "f", code: "F", discountType: "fixed", value: 999999, maxDiscount: null };
    expect(computeDiscount(122050, fixed)).toBe(122050);
  });

  it("allocates the order discount across lines exactly", () => {
    const shares = allocateDiscount(lines, 12205);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(12205);
    shares.forEach((share, i) => expect(share).toBeLessThanOrEqual(lines[i].unitPrice * lines[i].quantity));
  });

  it("adds shipping, waives it above the threshold (after discount) and adds the COD fee", () => {
    const shipping = { rateId: "r", fee: 6000, freeShippingThreshold: 150000 };
    const t1 = computeTotals({ lines, shipping, codFee: 1500 });
    expect(t1.shippingFee).toBe(6000);
    expect(t1.total).toBe(122050 + 6000 + 1500);

    const t2 = computeTotals({ lines, shipping: { ...shipping, freeShippingThreshold: 120000 } });
    expect(t2.shippingFee).toBe(0);
    expect(t2.shippingWaived).toBe(true);

    // 10% discount drops the subtotal below the threshold, so shipping is charged.
    const t3 = computeTotals({ lines, coupon: pct(10), shipping: { ...shipping, freeShippingThreshold: 120000 } });
    expect(t3.shippingFee).toBe(6000);
    expect(t3.total).toBe(122050 - 12205 + 6000);
  });

  it("supports free-shipping coupons", () => {
    const coupon: AppliedCoupon = { id: "s", code: "SHIP", discountType: "free_shipping", value: 0, maxDiscount: null };
    const totals = computeTotals({ lines, coupon, shipping: { rateId: "r", fee: 9000, freeShippingThreshold: null } });
    expect(totals.discount).toBe(0);
    expect(totals.shippingFee).toBe(0);
    expect(totals.total).toBe(122050);
  });

  it("rejects invalid quantities and fractional prices", () => {
    expect(() => computeTotals({ lines: [{ variantId: "x", quantity: 0, unitPrice: 100 }] })).toThrow();
    expect(() => computeTotals({ lines: [{ variantId: "x", quantity: 1, unitPrice: 10.5 }] })).toThrow();
  });
});

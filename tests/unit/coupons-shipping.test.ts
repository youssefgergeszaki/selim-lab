import { describe, expect, it } from "vitest";
import { normalizeCouponCode, validateCoupon, type CouponRecord } from "@/lib/commerce/coupons";
import { availableShippingOptions, lowestShippingFee, type ShippingRateRecord, type ShippingZoneRecord } from "@/lib/commerce/shipping";

const base: CouponRecord = {
  id: "c1",
  code: "WELCOME10",
  discountType: "percentage",
  value: 10,
  minSubtotal: 30000,
  maxDiscount: null,
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2026-12-31T00:00:00Z",
  usageLimit: 100,
  usageCount: 0,
  perCustomerLimit: 1,
  isActive: true,
};
const now = new Date("2026-06-01T00:00:00Z");

describe("coupon validation", () => {
  it("accepts a valid coupon", () => {
    const r = validateCoupon(base, { subtotal: 50000, now });
    expect(r.ok).toBe(true);
  });

  it.each([
    [null, "notFound"],
    [{ ...base, isActive: false }, "inactive"],
    [{ ...base, startsAt: "2026-07-01T00:00:00Z" }, "notStarted"],
    [{ ...base, endsAt: "2026-05-01T00:00:00Z" }, "expired"],
    [{ ...base, usageCount: 100 }, "usageLimit"],
  ] as const)("rejects %#", (coupon, reason) => {
    const r = validateCoupon(coupon as CouponRecord | null, { subtotal: 50000, now });
    expect(r).toMatchObject({ ok: false, reason });
  });

  it("enforces the minimum subtotal and per-customer limit", () => {
    expect(validateCoupon(base, { subtotal: 29999, now })).toMatchObject({ ok: false, reason: "minSubtotal", minSubtotal: 30000 });
    expect(validateCoupon(base, { subtotal: 50000, now, customerRedemptions: 1 })).toMatchObject({ ok: false, reason: "perCustomerLimit" });
  });

  it("normalizes codes and rejects malformed input", () => {
    expect(normalizeCouponCode("  welcome10 ")).toBe("WELCOME10");
    expect(normalizeCouponCode("a")).toBeNull();
    expect(normalizeCouponCode("DROP TABLE;")).toBeNull();
  });
});

const zones: ShippingZoneRecord[] = [
  { id: "z1", nameAr: "القاهرة", nameEn: "Cairo", governorates: ["cairo", "giza"], isActive: true, sortOrder: 1 },
  { id: "z2", nameAr: "أخرى", nameEn: "Other", governorates: ["aswan"], isActive: false, sortOrder: 2 },
];
const rate = (over: Partial<ShippingRateRecord>): ShippingRateRecord => ({
  id: "r",
  zoneId: "z1",
  nameAr: "قياسي",
  nameEn: "Standard",
  fee: 6000,
  minSubtotal: 0,
  maxSubtotal: null,
  freeShippingThreshold: null,
  etaMinDays: 1,
  etaMaxDays: 3,
  isActive: true,
  sortOrder: 0,
  ...over,
});

describe("shipping rules", () => {
  it("returns rates for the governorate's active zone, cheapest first", () => {
    const options = availableShippingOptions(
      zones,
      [rate({ id: "express", fee: 12000 }), rate({ id: "std", fee: 6000 }), rate({ id: "off", isActive: false })],
      "giza",
      10000,
    );
    expect(options.map((o) => o.id)).toEqual(["std", "express"]);
  });

  it("ignores inactive zones and unmatched governorates", () => {
    expect(availableShippingOptions(zones, [rate({ zoneId: "z2" })], "aswan", 10000)).toEqual([]);
    expect(availableShippingOptions(zones, [rate({})], "luxor", 10000)).toEqual([]);
  });

  it("applies subtotal bands and free-shipping thresholds", () => {
    const rates = [rate({ id: "small", maxSubtotal: 50000 }), rate({ id: "big", minSubtotal: 50001, freeShippingThreshold: 80000 })];
    expect(availableShippingOptions(zones, rates, "cairo", 40000).map((o) => o.id)).toEqual(["small"]);
    const big = availableShippingOptions(zones, rates, "cairo", 90000);
    expect(big.map((o) => [o.id, o.effectiveFee])).toEqual([["big", 0]]);
  });

  it("estimates the lowest fee", () => {
    expect(lowestShippingFee([rate({ fee: 9000 }), rate({ fee: 6000 })])).toBe(6000);
    expect(lowestShippingFee([])).toBeNull();
  });
});

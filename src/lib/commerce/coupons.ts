import type { Piasters } from "@/lib/money";
import type { AppliedCoupon, DiscountType } from "./pricing";

export interface CouponRecord {
  id: string;
  code: string;
  discountType: DiscountType;
  value: number;
  minSubtotal: Piasters;
  maxDiscount: Piasters | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
}

export type CouponRejection =
  | "notFound"
  | "inactive"
  | "notStarted"
  | "expired"
  | "minSubtotal"
  | "usageLimit"
  | "perCustomerLimit";

export type CouponResult =
  | { ok: true; coupon: AppliedCoupon }
  | { ok: false; reason: CouponRejection; minSubtotal?: Piasters };

/** Normalise user input: trimmed, upper-case, restricted alphabet. */
export function normalizeCouponCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9_-]{3,32}$/.test(code) ? code : null;
}

/**
 * Validates a coupon against the cart. Final enforcement of usage limits also happens
 * atomically in the database (place_order) under a row lock.
 */
export function validateCoupon(
  coupon: CouponRecord | null,
  context: { subtotal: Piasters; now?: Date; customerRedemptions?: number },
): CouponResult {
  if (!coupon) return { ok: false, reason: "notFound" };
  if (!coupon.isActive) return { ok: false, reason: "inactive" };
  const now = context.now ?? new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) return { ok: false, reason: "notStarted" };
  if (coupon.endsAt && new Date(coupon.endsAt) <= now) return { ok: false, reason: "expired" };
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, reason: "usageLimit" };
  }
  if (
    coupon.perCustomerLimit !== null &&
    (context.customerRedemptions ?? 0) >= coupon.perCustomerLimit
  ) {
    return { ok: false, reason: "perCustomerLimit" };
  }
  if (context.subtotal < coupon.minSubtotal) {
    return { ok: false, reason: "minSubtotal", minSubtotal: coupon.minSubtotal };
  }
  return {
    ok: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      value: coupon.value,
      maxDiscount: coupon.maxDiscount,
    },
  };
}

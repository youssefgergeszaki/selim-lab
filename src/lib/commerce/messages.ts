import type { Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatMoney, type Piasters } from "@/lib/money";
import type { CouponRejection } from "./coupons";

/** Localized coupon rejection messages (shared by cart and checkout). */
export function couponMessages(dict: Dictionary, locale: Locale, minSubtotal?: Piasters | null): Record<string, string> {
  return {
    notFound: dict.coupon.notFound,
    inactive: dict.coupon.inactive,
    notStarted: dict.coupon.notStarted,
    expired: dict.coupon.expired,
    minSubtotal: minSubtotal ? dict.coupon.minSubtotal.replace("{amount}", formatMoney(minSubtotal, locale)) : dict.coupon.minSubtotal,
    usageLimit: dict.coupon.usageLimit,
    perCustomerLimit: dict.coupon.perCustomerLimit,
    rate_limited: dict.common.tooManyRequests,
  } satisfies Record<CouponRejection | "rate_limited", string>;
}

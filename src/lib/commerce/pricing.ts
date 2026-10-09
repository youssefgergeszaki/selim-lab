import type { Piasters } from "@/lib/money";

/**
 * Pure pricing engine. All inputs come from trusted database records loaded on the server;
 * nothing here accepts prices from the browser. Amounts are integer piasters.
 */

export interface PricedLine {
  variantId: string;
  quantity: number;
  unitPrice: Piasters;
}

export type DiscountType = "percentage" | "fixed" | "free_shipping";

export interface AppliedCoupon {
  id: string;
  code: string;
  discountType: DiscountType;
  /** Percentage (0–100) for "percentage"; piasters for "fixed"; ignored for "free_shipping". */
  value: number;
  maxDiscount: Piasters | null;
}

export interface ShippingQuote {
  rateId: string;
  fee: Piasters;
  freeShippingThreshold: Piasters | null;
}

export interface TotalsInput {
  lines: PricedLine[];
  coupon?: AppliedCoupon | null;
  shipping?: ShippingQuote | null;
  codFee?: Piasters;
}

export interface Totals {
  subtotal: Piasters;
  discount: Piasters;
  lineDiscounts: Piasters[];
  shippingFee: Piasters;
  shippingWaived: boolean;
  codFee: Piasters;
  total: Piasters;
}

function assertPiasters(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer amount`);
  }
}

export function lineTotal(line: PricedLine): Piasters {
  return line.unitPrice * line.quantity;
}

export function computeSubtotal(lines: PricedLine[]): Piasters {
  return lines.reduce((sum, line) => {
    assertPiasters(line.unitPrice, "unitPrice");
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new Error("quantity must be >= 1");
    return sum + lineTotal(line);
  }, 0);
}

export function computeDiscount(subtotal: Piasters, coupon: AppliedCoupon | null | undefined): Piasters {
  if (!coupon || subtotal <= 0) return 0;
  let discount = 0;
  if (coupon.discountType === "percentage") {
    const pct = Math.min(Math.max(coupon.value, 0), 100);
    discount = Math.round((subtotal * pct) / 100);
  } else if (coupon.discountType === "fixed") {
    discount = Math.max(0, Math.round(coupon.value));
  }
  if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
    discount = Math.min(discount, coupon.maxDiscount);
  }
  return Math.min(discount, subtotal);
}

/** Split an order-level discount across lines proportionally (remainder on the largest line). */
export function allocateDiscount(lines: PricedLine[], discount: Piasters): Piasters[] {
  const subtotal = computeSubtotal(lines);
  if (discount <= 0 || subtotal <= 0) return lines.map(() => 0);
  const shares = lines.map((line) => Math.floor((lineTotal(line) * discount) / subtotal));
  let remainder = discount - shares.reduce((a, b) => a + b, 0);
  const order = lines
    .map((line, index) => ({ index, total: lineTotal(line) }))
    .sort((a, b) => b.total - a.total);
  let i = 0;
  while (remainder > 0) {
    const target = order[i % order.length].index;
    if (shares[target] < lineTotal(lines[target])) {
      shares[target] += 1;
      remainder -= 1;
    }
    i += 1;
  }
  return shares;
}

export function computeTotals(input: TotalsInput): Totals {
  const subtotal = computeSubtotal(input.lines);
  const discount = computeDiscount(subtotal, input.coupon);
  const lineDiscounts = allocateDiscount(input.lines, discount);
  const afterDiscount = subtotal - discount;

  let shippingFee = 0;
  let shippingWaived = false;
  if (input.shipping) {
    assertPiasters(input.shipping.fee, "shipping fee");
    shippingFee = input.shipping.fee;
    const threshold = input.shipping.freeShippingThreshold;
    if (threshold !== null && afterDiscount >= threshold) {
      shippingWaived = shippingFee > 0;
      shippingFee = 0;
    }
  }
  if (input.coupon?.discountType === "free_shipping" && shippingFee > 0) {
    shippingFee = 0;
    shippingWaived = true;
  }

  const codFee = input.codFee ?? 0;
  assertPiasters(codFee, "cod fee");

  return {
    subtotal,
    discount,
    lineDiscounts,
    shippingFee,
    shippingWaived,
    codFee,
    total: afterDiscount + shippingFee + codFee,
  };
}

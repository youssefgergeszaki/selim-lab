import type { Piasters } from "@/lib/money";

export interface ShippingZoneRecord {
  id: string;
  nameAr: string;
  nameEn: string;
  governorates: string[];
  isActive: boolean;
  sortOrder: number;
}

export interface ShippingRateRecord {
  id: string;
  zoneId: string;
  nameAr: string;
  nameEn: string;
  fee: Piasters;
  minSubtotal: Piasters;
  maxSubtotal: Piasters | null;
  freeShippingThreshold: Piasters | null;
  etaMinDays: number | null;
  etaMaxDays: number | null;
  isActive: boolean;
  sortOrder: number;
}

export interface ShippingOption extends ShippingRateRecord {
  zoneNameAr: string;
  zoneNameEn: string;
  /** Fee after applying the free-shipping threshold (before coupons). */
  effectiveFee: Piasters;
}

/**
 * Returns the shipping options available for a governorate and cart subtotal,
 * cheapest first. Rules are fully database-driven (configured in the dashboard).
 */
export function availableShippingOptions(
  zones: ShippingZoneRecord[],
  rates: ShippingRateRecord[],
  governorate: string,
  subtotal: Piasters,
): ShippingOption[] {
  const zoneById = new Map(
    zones.filter((z) => z.isActive && z.governorates.includes(governorate)).map((z) => [z.id, z]),
  );
  return rates
    .filter((rate) => {
      const zone = zoneById.get(rate.zoneId);
      if (!zone || !rate.isActive) return false;
      if (subtotal < rate.minSubtotal) return false;
      if (rate.maxSubtotal !== null && subtotal > rate.maxSubtotal) return false;
      return true;
    })
    .map((rate) => {
      const zone = zoneById.get(rate.zoneId)!;
      const free = rate.freeShippingThreshold !== null && subtotal >= rate.freeShippingThreshold;
      return {
        ...rate,
        zoneNameAr: zone.nameAr,
        zoneNameEn: zone.nameEn,
        effectiveFee: free ? 0 : rate.fee,
      };
    })
    .sort((a, b) => a.effectiveFee - b.effectiveFee || a.sortOrder - b.sortOrder);
}

/** Lowest standard fee across all active rates — used for the cart's "from" estimate. */
export function lowestShippingFee(rates: ShippingRateRecord[]): Piasters | null {
  const active = rates.filter((r) => r.isActive);
  if (active.length === 0) return null;
  return Math.min(...active.map((r) => r.fee));
}

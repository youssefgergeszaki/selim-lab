import type { AdminDictionary } from "@/i18n/admin";

/** Maps action error codes to localized dashboard messages. */
export function adminMessages(a: AdminDictionary): Record<string, string> {
  return {
    saved: a.common.saved,
    error: a.common.error,
    forbidden: a.common.forbidden,
    validation: a.common.validation,
    not_configured: a.common.notConfigured,
    duplicate: a.common.duplicate,
    in_use: a.common.inUse,
    upload_too_large: a.common.uploadTooLarge,
    upload_unsupported_type: a.common.uploadType,
    upload_signature_mismatch: a.common.uploadType,
    upload_missing: a.common.validation,
    SL_INVALID_TRANSITION: a.orders.invalidTransition,
    SL_NOT_PAID: a.orders.notPaid,
    SL_STOCK_BELOW_RESERVED: a.common.stockBelowReserved,
    user_not_found: a.team.userNotFound,
    cannot_revoke_self: a.team.cannotRevokeSelf,
    no_variants: a.products.noVariants,
  };
}

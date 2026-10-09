"use server";

import { redirect } from "next/navigation";
import { localizePath } from "@/i18n/config";
import { getSessionUser } from "@/lib/auth";
import { isServiceRoleConfigured } from "@/lib/env";
import { logger } from "@/lib/logger";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { CheckoutError, placeOrder, rememberOrderToken, type CheckoutErrorCode } from "@/server/checkout";
import { ORDER_PAYMENT_COLUMNS, startPaymobPayment, type OrderForPayment } from "@/server/payments/attempts";

export type CheckoutState = {
  status: "idle" | "error";
  error?: CheckoutErrorCode;
  fieldErrors?: Partial<Record<string, string>>;
};



export async function submitCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const raw = Object.fromEntries(
    [
      "idempotencyKey",
      "locale",
      "fullName",
      "email",
      "phone",
      "governorate",
      "city",
      "addressLine",
      "notes",
      "shippingRateId",
      "paymentMethod",
      "saveAddress",
    ].map((k) => [k, formData.get(k) ?? undefined]),
  );
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return { status: "error", error: "validation", fieldErrors };
  }
  if (!isServiceRoleConfigured()) return { status: "error", error: "server" };
  if (!(await rateLimit(RATE_LIMITS.checkout))) return { status: "error", error: "rate_limited" };

  const input = parsed.data;
  const user = await getSessionUser();
  let destination: string;

  try {
    const placed = await placeOrder({
      idempotencyKey: input.idempotencyKey,
      locale: input.locale,
      userId: user?.id ?? null,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      governorate: input.governorate,
      city: input.city,
      addressLine: input.addressLine,
      notes: input.notes,
      shippingRateId: input.shippingRateId,
      paymentMethod: input.paymentMethod,
    });
    if (placed.accessToken) await rememberOrderToken(placed.reference, placed.accessToken);

    if (user && input.saveAddress && !placed.duplicate) {
      await saveAddressForUser(user.id, input).catch(() => undefined);
    }

    destination = localizePath(input.locale, `/order/${placed.reference}`);
    if (input.paymentMethod !== "cod" && !placed.duplicate) {
      const db = createServiceClient();
      const { data: order } = await db.from("orders").select(ORDER_PAYMENT_COLUMNS).eq("id", placed.orderId).single();
      const checkoutUrl = order ? await startPaymobPayment(order as OrderForPayment) : null;
      // If Paymob is unreachable the order page offers "retry payment" while stock is reserved.
      destination = checkoutUrl ?? `${destination}?payment=init_failed`;
    }
  } catch (error) {
    if (error instanceof CheckoutError) return { status: "error", error: error.code };
    logger.error("checkout.unexpected", { error: String(error) });
    return { status: "error", error: "server" };
  }
  redirect(destination);
}

async function saveAddressForUser(userId: string, input: CheckoutInput) {
  const db = createServiceClient();
  const { count } = await db.from("addresses").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= 10) return;
  const { data: duplicate } = await db
    .from("addresses")
    .select("id")
    .eq("user_id", userId)
    .eq("address_line", input.addressLine)
    .eq("city", input.city)
    .maybeSingle();
  if (duplicate) return;
  await db.from("addresses").insert({
    user_id: userId,
    full_name: input.fullName,
    phone: input.phone,
    governorate: input.governorate,
    city: input.city,
    address_line: input.addressLine,
    notes: input.notes ?? null,
    is_default: (count ?? 0) === 0,
  });
}

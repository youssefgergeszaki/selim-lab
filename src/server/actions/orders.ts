"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { localizePath } from "@/i18n/config";
import { RATE_LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrderForViewer } from "@/server/orders";
import { ORDER_PAYMENT_COLUMNS, startPaymobPayment, type OrderForPayment } from "@/server/payments/attempts";

const schema = z.object({
  reference: z.string().regex(/^SL-\d{6}-[A-Z0-9]{6}$/),
  token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/).optional(),
  locale: z.enum(["ar", "en"]),
});

/** Starts a new Paymob attempt for an unpaid, still-reserved order the viewer may access. */
export async function retryPayment(formData: FormData): Promise<void> {
  const parsed = schema.safeParse({
    reference: formData.get("reference"),
    token: formData.get("token") || undefined,
    locale: formData.get("locale"),
  });
  if (!parsed.success) return;
  const { reference, token, locale } = parsed.data;
  const orderPath = localizePath(locale, `/order/${reference}`);

  if (!(await rateLimit(RATE_LIMITS.payment))) redirect(`${orderPath}?payment=rate_limited`);
  const access = await getOrderForViewer(reference, token);
  if (!access || !access.order.canRetryPayment) redirect(orderPath);

  const { data: order } = await createServiceClient()
    .from("orders")
    .select(ORDER_PAYMENT_COLUMNS)
    .eq("id", access.order.id)
    .single();
  const url = order ? await startPaymobPayment(order as OrderForPayment) : null;
  redirect(url ?? `${orderPath}?payment=init_failed`);
}

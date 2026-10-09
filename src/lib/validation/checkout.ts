import { z } from "zod";
import {
  checkboxSchema,
  egyptianPhoneSchema,
  emailSchema,
  fullNameSchema,
  governorateSchema,
  optionalText,
} from "./common";

/** Server-side validation of the checkout form. Prices and totals are never accepted from the client. */
export const checkoutSchema = z.object({
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
  locale: z.enum(["ar", "en"]),
  fullName: fullNameSchema,
  email: emailSchema,
  phone: egyptianPhoneSchema,
  governorate: governorateSchema,
  city: z.string().trim().min(2).max(80),
  addressLine: z.string().trim().min(5).max(300),
  notes: optionalText(300),
  shippingRateId: z.uuid(),
  paymentMethod: z.enum(["paymob_card", "paymob_wallet", "cod"]),
  saveAddress: checkboxSchema,
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

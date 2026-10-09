"use client";

import { useActionState, useMemo, useState } from "react";
import { submitCheckout, type CheckoutState } from "@/server/actions/checkout";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { formatMoney, type Piasters } from "@/lib/money";
import { computeTotals, type AppliedCoupon } from "@/lib/commerce/pricing";
import { availableShippingOptions, type ShippingRateRecord, type ShippingZoneRecord } from "@/lib/commerce/shipping";
import { governorates } from "@/lib/governorates";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Method = "paymob_card" | "paymob_wallet" | "cod";

export interface CheckoutLine {
  variantId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  unitPrice: Piasters;
}

export interface SavedAddress {
  id: string;
  label: string | null;
  fullName: string;
  phone: string;
  governorate: string;
  city: string;
  addressLine: string;
  notes: string | null;
  isDefault: boolean;
}

export function CheckoutForm({
  locale,
  dict,
  idempotencyKey,
  lines,
  coupon,
  zones,
  rates,
  methods,
  codFee,
  codMaxTotal,
  defaults,
  addresses,
  isSignedIn,
}: {
  locale: Locale;
  dict: Dictionary;
  idempotencyKey: string;
  lines: CheckoutLine[];
  coupon: AppliedCoupon | null;
  zones: ShippingZoneRecord[];
  rates: ShippingRateRecord[];
  methods: Method[];
  codFee: Piasters;
  codMaxTotal: Piasters | null;
  defaults: { fullName: string; email: string; phone: string };
  addresses: SavedAddress[];
  isSignedIn: boolean;
}) {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(submitCheckout, { status: "idle" });
  const initial = addresses.find((a) => a.isDefault) ?? addresses[0];
  const [address, setAddress] = useState({
    fullName: initial?.fullName ?? defaults.fullName,
    email: defaults.email,
    phone: initial?.phone ?? defaults.phone,
    governorate: initial?.governorate ?? "",
    city: initial?.city ?? "",
    addressLine: initial?.addressLine ?? "",
    notes: initial?.notes ?? "",
  });
  const [rateId, setRateId] = useState<string>("");
  const [method, setMethod] = useState<Method | "">(methods.length === 1 ? methods[0] : "");

  const priced = useMemo(() => lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice })), [lines]);
  const base = computeTotals({ lines: priced, coupon });
  const options = address.governorate
    ? availableShippingOptions(zones, rates, address.governorate, base.subtotal - base.discount)
    : [];
  const selectedRate = options.find((o) => o.id === rateId) ?? options[0] ?? null;
  const totals = computeTotals({
    lines: priced,
    coupon,
    shipping: selectedRate
      ? { rateId: selectedRate.id, fee: selectedRate.fee, freeShippingThreshold: selectedRate.freeShippingThreshold }
      : null,
    codFee: method === "cod" ? codFee : 0,
  });
  const codBlocked = codMaxTotal !== null && method === "cod" && totals.total > codMaxTotal;

  const fe = state.fieldErrors ?? {};
  const fieldError = (key: keyof Dictionary["checkout"]["fieldErrors"]) => (fe[key] ? dict.checkout.fieldErrors[key] : null);
  const errorMessage = (() => {
    if (state.status !== "error" || !state.error) return null;
    const e = dict.checkout.errors;
    switch (state.error) {
      case "empty_cart":
        return e.emptyCart;
      case "out_of_stock":
        return e.outOfStock;
      case "price_changed":
        return e.priceChanged;
      case "coupon_invalid":
        return e.invalidCoupon;
      case "coupon_exhausted":
        return e.couponExhausted;
      case "shipping_unavailable":
        return e.shippingUnavailable;
      case "payment_unavailable":
        return e.paymentUnavailable;
      case "validation":
        return e.validation;
      case "rate_limited":
        return dict.common.tooManyRequests;
      default:
        return dict.common.genericError;
    }
  })();

  const update = (key: keyof typeof address) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setAddress((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <form action={action} className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_400px]" noValidate>
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-12">
        {errorMessage ? <Alert tone="danger">{errorMessage}</Alert> : null}

        <fieldset className="space-y-5">
          <legend className="mb-5 font-display text-2xl">{dict.checkout.contact}</legend>
          {!isSignedIn ? <p className="-mt-2 text-sm text-subtle">{dict.checkout.guestNotice}</p> : null}
          <Field id="fullName" label={dict.checkout.fullName} error={fieldError("fullName")}>
            <Input
              id="fullName"
              name="fullName"
              autoComplete="name"
              required
              maxLength={120}
              value={address.fullName}
              onChange={update("fullName")}
              aria-invalid={fe.fullName ? true : undefined}
              aria-describedby={fe.fullName ? "fullName-error" : undefined}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="email" label={dict.checkout.email} error={fieldError("email")}>
              <Input
                id="email"
                name="email"
                type="email"
                dir="ltr"
                autoComplete="email"
                inputMode="email"
                required
                maxLength={254}
                value={address.email}
                onChange={update("email")}
                aria-invalid={fe.email ? true : undefined}
                aria-describedby={fe.email ? "email-error" : undefined}
                className="text-start"
              />
            </Field>
            <Field id="phone" label={dict.checkout.phone} hint={dict.checkout.phoneHint} error={fieldError("phone")}>
              <Input
                id="phone"
                name="phone"
                type="tel"
                dir="ltr"
                autoComplete="tel-national"
                inputMode="tel"
                required
                maxLength={20}
                value={address.phone}
                onChange={update("phone")}
                aria-invalid={fe.phone ? true : undefined}
                aria-describedby={fe.phone ? "phone-error" : "phone-hint"}
                className="text-start"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-5">
          <legend className="mb-5 font-display text-2xl">{dict.checkout.delivery}</legend>
          {addresses.length > 0 ? (
            <div>
              <p className="eyebrow mb-3">{dict.checkout.savedAddresses}</p>
              <div className="flex flex-wrap gap-2">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setAddress((prev) => ({
                        ...prev,
                        fullName: a.fullName,
                        phone: a.phone,
                        governorate: a.governorate,
                        city: a.city,
                        addressLine: a.addressLine,
                        notes: a.notes ?? "",
                      }));
                      setRateId("");
                    }}
                    className="border border-line-strong px-3 py-2 text-start text-sm hover:border-deep"
                  >
                    <span className="block font-medium">{a.label || a.city}</span>
                    <span className="block text-xs text-subtle">{a.addressLine}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="governorate" label={dict.checkout.governorate} error={fieldError("governorate")}>
              <Select
                id="governorate"
                name="governorate"
                required
                autoComplete="address-level1"
                value={address.governorate}
                onChange={(e) => {
                  update("governorate")(e);
                  setRateId("");
                }}
                aria-invalid={fe.governorate ? true : undefined}
              >
                <option value="">{dict.cart.selectGovernorate}</option>
                {governorates.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g[locale]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="city" label={dict.checkout.city} error={fieldError("city")}>
              <Input
                id="city"
                name="city"
                autoComplete="address-level2"
                required
                maxLength={80}
                value={address.city}
                onChange={update("city")}
                aria-invalid={fe.city ? true : undefined}
              />
            </Field>
          </div>
          <Field id="addressLine" label={dict.checkout.address} hint={dict.checkout.addressHint} error={fieldError("addressLine")}>
            <Textarea
              id="addressLine"
              name="addressLine"
              autoComplete="street-address"
              required
              rows={2}
              maxLength={300}
              value={address.addressLine}
              onChange={update("addressLine")}
              aria-invalid={fe.addressLine ? true : undefined}
              aria-describedby={fe.addressLine ? "addressLine-error" : "addressLine-hint"}
            />
          </Field>
          <Field id="notes" label={dict.checkout.notes} optionalLabel={dict.common.optional}>
            <Textarea id="notes" name="notes" rows={2} maxLength={300} value={address.notes} onChange={update("notes")} />
          </Field>
          {isSignedIn ? (
            <label className="flex items-center gap-2 text-sm text-muted">
              <Checkbox name="saveAddress" defaultChecked={addresses.length === 0} />
              {dict.account.addAddress}
            </label>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-5 font-display text-2xl">{dict.checkout.shippingMethod}</legend>
          {!address.governorate ? (
            <p className="text-sm text-subtle">{dict.checkout.selectGovernorateFirst}</p>
          ) : options.length === 0 ? (
            <Alert tone="warning">{dict.checkout.noShippingAvailable}</Alert>
          ) : (
            <div className="space-y-2">
              {options.map((o) => {
                const checked = selectedRate?.id === o.id;
                const fee = coupon?.discountType === "free_shipping" ? 0 : o.effectiveFee;
                return (
                  <label
                    key={o.id}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-4 border px-4 py-3.5 has-[:focus-visible]:outline-2",
                      checked ? "border-deep" : "border-line-strong/70",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shippingRateId"
                        value={o.id}
                        checked={checked}
                        onChange={() => setRateId(o.id)}
                        className="accent-[var(--brand-deep)]"
                      />
                      <span>
                        <span className="block text-sm font-medium">{locale === "ar" ? o.nameAr : o.nameEn}</span>
                        {o.etaMinDays !== null && o.etaMaxDays !== null ? (
                          <span className="block text-xs text-subtle">
                            {dict.checkout.deliveryEta.replace("{min}", String(o.etaMinDays)).replace("{max}", String(o.etaMaxDays))}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="ltr-nums text-sm">{fee === 0 ? dict.cart.free : formatMoney(fee, locale)}</span>
                  </label>
                );
              })}
            </div>
          )}
          {fieldError("shippingRateId") ? <p className="mt-2 text-sm text-danger">{fieldError("shippingRateId")}</p> : null}
        </fieldset>

        <fieldset>
          <legend className="mb-5 font-display text-2xl">{dict.checkout.payment}</legend>
          {methods.length === 0 ? (
            <Alert tone="warning">{dict.checkout.noPaymentMethods}</Alert>
          ) : (
            <div className="space-y-2">
              {methods.map((m) => (
                <label
                  key={m}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 border px-4 py-3.5 has-[:focus-visible]:outline-2",
                    method === m ? "border-deep" : "border-line-strong/70",
                  )}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={m}
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    className="mt-1 accent-[var(--brand-deep)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{dict.checkout.methods[m]}</span>
                    <span className="block text-xs text-subtle">{dict.checkout.methodDescriptions[m]}</span>
                    {m === "cod" && codFee > 0 ? (
                      <span className="ltr-nums mt-1 block text-xs text-muted">
                        {dict.checkout.codFee}: {formatMoney(codFee, locale)}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {fieldError("paymentMethod") ? <p className="mt-2 text-sm text-danger">{fieldError("paymentMethod")}</p> : null}
          {codBlocked ? <p className="mt-2 text-sm text-danger">{dict.checkout.codUnavailableForTotal}</p> : null}
        </fieldset>
      </div>

      <aside aria-labelledby="checkout-summary" className="h-fit border border-line bg-surface p-6 lg:sticky lg:top-28">
        <h2 id="checkout-summary" className="font-display text-2xl">
          {dict.checkout.summary}
        </h2>
        <ul className="mt-5 space-y-3 border-b border-line pb-5 text-sm">
          {lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-4">
              <span className="min-w-0">
                <span className="block truncate">{l.name}</span>
                <span className="text-xs text-subtle">
                  {l.variantName ? `${l.variantName} · ` : ""}× <span className="ltr-nums">{l.quantity}</span>
                </span>
              </span>
              <span className="ltr-nums shrink-0">{formatMoney(l.unitPrice * l.quantity, locale)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-5 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">{dict.cart.subtotal}</dt>
            <dd className="ltr-nums">{formatMoney(totals.subtotal, locale)}</dd>
          </div>
          {totals.discount > 0 ? (
            <div className="flex justify-between text-success">
              <dt>
                {dict.cart.discount}
                {coupon ? ` (${coupon.code})` : ""}
              </dt>
              <dd className="ltr-nums">{formatMoney(-totals.discount, locale)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-muted">{dict.cart.shipping}</dt>
            <dd className="ltr-nums">
              {selectedRate ? (totals.shippingFee === 0 ? dict.cart.free : formatMoney(totals.shippingFee, locale)) : "—"}
            </dd>
          </div>
          {totals.codFee > 0 ? (
            <div className="flex justify-between">
              <dt className="text-muted">{dict.checkout.codFee}</dt>
              <dd className="ltr-nums">{formatMoney(totals.codFee, locale)}</dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
          <span className="font-medium">{dict.cart.grandTotal}</span>
          <span className="ltr-nums text-xl font-medium">{formatMoney(totals.total, locale)}</span>
        </div>
        <Button
          type="submit"
          size="lg"
          className="mt-6 w-full"
          disabled={pending || methods.length === 0 || !selectedRate || codBlocked}
        >
          {pending ? dict.checkout.placing : method === "cod" ? dict.checkout.placeOrder : dict.checkout.placeOrderAndPay}
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-subtle">{dict.checkout.termsNotice}</p>
        <p className="mt-2 text-xs leading-relaxed text-subtle">{dict.checkout.secureNotice}</p>
      </aside>
    </form>
  );
}

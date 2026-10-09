"use client";

import { useActionState } from "react";
import { applyCoupon, removeCoupon, type CouponActionState } from "@/server/actions/cart";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/i18n/config";

export function CouponForm({
  locale,
  appliedCode,
  appliedValid,
  labels,
  messages,
}: {
  locale: Locale;
  appliedCode: string | null;
  appliedValid: boolean;
  labels: { label: string; apply: string; remove: string; applied: string };
  /** Pre-localized error messages keyed by rejection reason. */
  messages: Record<string, string>;
}) {
  const [state, action, pending] = useActionState<CouponActionState, FormData>(applyCoupon, { status: "idle" });

  if (appliedCode) {
    return (
      <form action={removeCoupon} className="flex items-center justify-between gap-3 text-sm">
        <span className={appliedValid ? "text-success" : "text-warning"}>
          {labels.applied.replace("{code}", appliedCode)}
        </span>
        <Button type="submit" variant="link" size="sm" className="text-sm">
          {labels.remove}
        </Button>
      </form>
    );
  }

  const error =
    state.status === "error"
      ? (messages[state.reason ?? "notFound"] ?? messages.notFound).replace(
          "{amount}",
          state.minSubtotal ? formatMoney(state.minSubtotal, locale) : "",
        )
      : null;
  return (
    <form action={action} className="space-y-2">
      <label htmlFor="coupon-code" className="eyebrow block">
        {labels.label}
      </label>
      <div className="flex gap-2">
        <input
          id="coupon-code"
          name="code"
          autoComplete="off"
          maxLength={32}
          dir="ltr"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "coupon-error" : undefined}
          className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 text-sm uppercase placeholder:normal-case focus:border-deep focus:outline-none"
        />
        <Button type="submit" variant="outline" size="sm" className="h-10" disabled={pending}>
          {labels.apply}
        </Button>
      </div>
      {error ? (
        <p id="coupon-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </form>
  );
}

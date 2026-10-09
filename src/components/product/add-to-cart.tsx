"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { addToCart } from "@/server/actions/cart";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface VariantOption {
  id: string;
  sku: string;
  name: string | null;
  price: number;
  compareAtPrice: number | null;
  available: number;
}

interface Labels {
  variant: string;
  quantity: string;
  decrease: string;
  increase: string;
  addToCart: string;
  adding: string;
  added: string;
  viewCart: string;
  outOfStock: string;
  inStock: string;
  lowStock: string;
  sku: string;
  originalPrice: string;
  onlyLeft: string;
  genericError: string;
  tooMany: string;
}

export function AddToCartForm({
  locale,
  variants,
  defaultVariantId,
  labels,
  cartHref,
  lowStockThreshold,
  maxQuantity = 10,
}: {
  locale: Locale;
  variants: VariantOption[];
  defaultVariantId: string;
  labels: Labels;
  cartHref: string;
  lowStockThreshold: number;
  maxQuantity?: number;
}) {
  const router = useRouter();
  const [variantId, setVariantId] = useState(defaultVariantId);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const variant = variants.find((v) => v.id === variantId) ?? variants[0];
  const max = Math.max(Math.min(variant.available, maxQuantity), 0);
  const soldOut = variant.available <= 0;
  const qty = Math.min(Math.max(quantity, 1), Math.max(max, 1));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await addToCart({ variantId: variant.id, quantity: qty });
      if (result.ok) {
        setMessage({ tone: "success", text: labels.added });
        router.refresh();
      } else if (result.error === "insufficient") {
        setMessage({ tone: "error", text: labels.onlyLeft.replace("{count}", String(result.available ?? 0)) });
      } else if (result.error === "unavailable") {
        setMessage({ tone: "error", text: labels.outOfStock });
      } else if (result.error === "rate_limited") {
        setMessage({ tone: "error", text: labels.tooMany });
      } else {
        setMessage({ tone: "error", text: labels.genericError });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-7">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="ltr-nums text-2xl font-medium text-deep">{formatMoney(variant.price, locale)}</span>
        {variant.compareAtPrice ? (
          <span className="ltr-nums text-base text-subtle line-through">
            <span className="sr-only">{labels.originalPrice}: </span>
            {formatMoney(variant.compareAtPrice, locale)}
          </span>
        ) : null}
      </div>

      {variants.length > 1 ? (
        <fieldset>
          <legend className="eyebrow mb-3">{labels.variant}</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => (
              <label
                key={v.id}
                className={cn(
                  "cursor-pointer border px-4 py-2.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2",
                  v.id === variantId ? "border-deep bg-deep text-ivory" : "border-line-strong hover:border-deep",
                  v.available <= 0 && "text-subtle line-through decoration-1",
                )}
              >
                <input
                  type="radio"
                  name="variant"
                  value={v.id}
                  checked={v.id === variantId}
                  onChange={() => {
                    setVariantId(v.id);
                    setQuantity(1);
                    setMessage(null);
                  }}
                  className="sr-only"
                />
                {v.name ?? v.sku}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <span className={cn(soldOut ? "text-danger" : variant.available <= lowStockThreshold ? "text-warning" : "text-success")}>
          {soldOut ? labels.outOfStock : variant.available <= lowStockThreshold ? labels.lowStock : labels.inStock}
        </span>
        <span className="text-subtle">
          {labels.sku}: <span className="ltr-nums">{variant.sku}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-stretch gap-3">
        <div className="flex items-center border border-line-strong" role="group" aria-label={labels.quantity}>
          <button
            type="button"
            className="inline-flex size-12 items-center justify-center disabled:opacity-40"
            onClick={() => setQuantity(Math.max(qty - 1, 1))}
            disabled={soldOut || qty <= 1}
            aria-label={labels.decrease}
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <label htmlFor="pdp-qty" className="sr-only">
            {labels.quantity}
          </label>
          <input
            id="pdp-qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={Math.max(max, 1)}
            value={qty}
            disabled={soldOut}
            onChange={(e) => setQuantity(Number.parseInt(e.target.value, 10) || 1)}
            className="ltr-nums h-12 w-12 border-x border-line bg-transparent text-center [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            className="inline-flex size-12 items-center justify-center disabled:opacity-40"
            onClick={() => setQuantity(Math.min(qty + 1, max))}
            disabled={soldOut || qty >= max}
            aria-label={labels.increase}
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>
        <Button type="submit" size="lg" className="h-12 min-w-56 flex-1" disabled={soldOut || pending}>
          {soldOut ? labels.outOfStock : pending ? labels.adding : labels.addToCart}
        </Button>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {message ? (
          <p className={message.tone === "success" ? "text-success" : "text-danger"}>
            {message.text}
            {message.tone === "success" ? (
              <>
                {" · "}
                <Link href={cartHref} className="link-underline text-deep">
                  {labels.viewCart}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </form>
  );
}

import type { Locale } from "@/i18n/config";
import { formatMoney, type Piasters } from "@/lib/money";
import { cn } from "@/lib/utils";

export function Price({
  locale,
  amount,
  compareAt,
  originalLabel,
  className,
  size = "md",
}: {
  locale: Locale;
  amount: Piasters;
  compareAt?: Piasters | null;
  originalLabel: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const onSale = compareAt !== null && compareAt !== undefined && compareAt > amount;
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2.5", className)}>
      <span
        className={cn(
          "ltr-nums font-medium text-deep",
          size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-base",
        )}
      >
        {formatMoney(amount, locale)}
      </span>
      {onSale ? (
        <span className={cn("ltr-nums text-subtle line-through", size === "lg" ? "text-base" : "text-sm")}>
          <span className="sr-only">{originalLabel}: </span>
          {formatMoney(compareAt, locale)}
        </span>
      ) : null}
    </p>
  );
}

import Image from "next/image";
import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import type { ProductCardData } from "@/server/catalog";
import { Price } from "./price";
import { BrandLogo } from "@/components/layout/brand-logo";

export function ProductCard({
  product,
  locale,
  dict,
  lowStockThreshold = 5,
  eager = false,
}: {
  product: ProductCardData;
  locale: Locale;
  dict: Dictionary;
  lowStockThreshold?: number;
  eager?: boolean;
}) {
  const href = localizePath(locale, `/products/${encodeURIComponent(product.slug)}`);
  const outOfStock = product.availableQuantity <= 0;
  const lowStock = !outOfStock && product.availableQuantity <= lowStockThreshold;
  const onSale = product.compareAtPrice !== null;

  return (
    <article className="group relative flex flex-col">
      <Link href={href} className="block focus-visible:outline-offset-4" aria-label={product.name}>
        <div className="relative aspect-[4/5] overflow-hidden bg-surface-muted">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.imageAlt}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 300px"
              loading={eager ? "eager" : "lazy"}
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <BrandLogo variant="mark" className="w-16 opacity-25" label="" />
              <span className="sr-only">{dict.product.noImage}</span>
            </div>
          )}
          <div className="absolute inset-x-3 top-3 flex justify-between gap-2">
            {onSale ? (
              <span className="bg-ivory/90 px-2 py-0.5 text-[0.7rem] font-medium text-accent-strong">
                {dict.product.salePrice}
              </span>
            ) : (
              <span />
            )}
            {outOfStock ? (
              <span className="bg-ivory/90 px-2 py-0.5 text-[0.7rem] text-muted">{dict.product.outOfStock}</span>
            ) : null}
          </div>
          <span className="pointer-events-none absolute inset-0 border border-transparent transition-colors duration-300 group-hover:border-line-gold" />
        </div>
      </Link>
      <div className="mt-4 flex flex-1 flex-col">
        <h3 className="font-display text-xl leading-snug">
          <Link href={href} className="hover:text-accent-strong">
            {product.name}
          </Link>
        </h3>
        {product.shortDescription ? (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted">{product.shortDescription}</p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <Price locale={locale} amount={product.price} compareAt={product.compareAtPrice} originalLabel={dict.product.originalPrice} />
          {lowStock ? <span className="text-xs text-warning">{dict.product.lowStock}</span> : null}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-12 sm:gap-x-6 lg:grid-cols-4">{children}</div>;
}

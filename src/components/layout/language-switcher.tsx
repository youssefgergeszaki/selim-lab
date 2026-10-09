"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { otherLocale, switchLocalePath, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

interface Props {
  locale: Locale;
  label: string;
  ariaLabel: string;
  className?: string;
}

function SwitcherLink({ locale, label, ariaLabel, className }: Props) {
  const pathname = usePathname() || `/${locale}`;
  const search = useSearchParams()?.toString();
  const target = otherLocale(locale);
  const href = `${switchLocalePath(pathname, target)}${search ? `?${search}` : ""}`;
  return (
    <Link
      href={href}
      hrefLang={target}
      lang={target}
      aria-label={ariaLabel}
      prefetch={false}
      className={cn("text-sm text-deep transition-colors hover:text-accent-strong", className)}
    >
      {label}
    </Link>
  );
}

/** Switches language while keeping the visitor on the same page (and query string). */
export function LanguageSwitcher(props: Props) {
  return (
    <Suspense
      fallback={
        <Link href={`/${otherLocale(props.locale)}`} lang={otherLocale(props.locale)} className={cn("text-sm", props.className)}>
          {props.label}
        </Link>
      }
    >
      <SwitcherLink {...props} />
    </Suspense>
  );
}

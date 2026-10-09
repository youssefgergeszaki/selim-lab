import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { localizePath } from "@/i18n/config";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Container } from "@/components/ui/misc";

/** Branded frame for sign-in / registration / password screens. */
export function AuthShell({
  locale,
  title,
  subtitle,
  children,
  footer,
}: {
  locale: Locale;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Container className="grid min-h-[70vh] grid-cols-1 items-center gap-12 py-12 lg:grid-cols-2 lg:gap-20 lg:py-20">
      <div className="hidden h-full items-center justify-center bg-surface-muted/70 p-12 lg:flex">
        <Link href={localizePath(locale, "/")} aria-label="SELIM LAB" className="block w-full max-w-sm">
          <BrandLogo variant="full" className="w-full" label="SELIM LAB" />
        </Link>
      </div>
      <div className="mx-auto w-full max-w-md">
        <Link href={localizePath(locale, "/")} className="mb-10 block w-40 lg:hidden" aria-label="SELIM LAB">
          <BrandLogo variant="full" className="w-full" label="SELIM LAB" />
        </Link>
        <h1 className="font-display text-4xl">{title}</h1>
        {subtitle ? <p className="mt-3 text-muted">{subtitle}</p> : null}
        <div className="hairline my-8" aria-hidden="true" />
        {children}
        {footer ? <div className="mt-8 text-sm text-muted">{footer}</div> : null}
      </div>
    </Container>
  );
}

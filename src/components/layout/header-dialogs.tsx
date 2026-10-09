"use client";

import Link from "next/link";
import { Dialog } from "radix-ui";
import { Menu, Search, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
}

/** Full-screen search panel (GET form to the shop page — works without JavaScript too). */
export function SearchDialog({
  action,
  label,
  placeholder,
  closeLabel,
}: {
  action: string;
  label: string;
  placeholder: string;
  closeLabel: string;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="inline-flex size-10 items-center justify-center text-deep hover:text-accent-strong" aria-label={label}>
          <Search className="size-[18px]" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/30" />
        <Dialog.Content className="fixed inset-x-0 top-0 z-50 border-b border-line-gold bg-ivory px-5 py-8 sm:px-8">
          <Dialog.Title className="sr-only">{label}</Dialog.Title>
          <Dialog.Description className="sr-only">{placeholder}</Dialog.Description>
          <form action={action} method="get" role="search" className="mx-auto flex max-w-3xl items-center gap-3">
            <Search className="size-5 shrink-0 text-muted" strokeWidth={1.5} aria-hidden="true" />
            <label htmlFor="site-search" className="sr-only">
              {label}
            </label>
            <input
              id="site-search"
              name="q"
              type="search"
              autoFocus
              autoComplete="off"
              maxLength={80}
              placeholder={placeholder}
              className="h-12 w-full border-0 border-b border-line-strong bg-transparent text-lg text-deep placeholder:text-subtle focus:border-deep focus:outline-none"
            />
            <Dialog.Close asChild>
              <button type="button" aria-label={closeLabel} className="inline-flex size-10 shrink-0 items-center justify-center">
                <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Mobile navigation drawer. Slides from the inline-start edge (right in Arabic, left in English). */
export function MobileNav({
  items,
  secondary,
  openLabel,
  closeLabel,
  title,
  searchAction,
  searchPlaceholder,
  searchLabel,
  footer,
}: {
  items: NavItem[];
  secondary: NavItem[];
  openLabel: string;
  closeLabel: string;
  title: string;
  searchAction: string;
  searchPlaceholder: string;
  searchLabel: string;
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="inline-flex size-10 items-center justify-center text-deep lg:hidden" aria-label={openLabel}>
          <Menu className="size-5" strokeWidth={1.5} aria-hidden="true" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-deep/30" />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 start-0 z-50 flex w-[86vw] max-w-sm flex-col border-e border-line-gold bg-ivory",
          )}
        >
          <div className="flex h-[var(--header-height)] items-center justify-between border-b border-line px-5">
            <Dialog.Title className="eyebrow">{title}</Dialog.Title>
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
            <Dialog.Close asChild>
              <button type="button" aria-label={closeLabel} className="inline-flex size-10 items-center justify-center">
                <X className="size-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-6">
            <form action={searchAction} method="get" role="search" className="mb-8">
              <label htmlFor="mobile-search" className="sr-only">
                {searchLabel}
              </label>
              <input
                id="mobile-search"
                name="q"
                type="search"
                maxLength={80}
                placeholder={searchPlaceholder}
                className="h-11 w-full border-0 border-b border-line-strong bg-transparent text-deep placeholder:text-subtle focus:border-deep focus:outline-none"
              />
            </form>
            <nav aria-label={title}>
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block py-3 font-display text-2xl text-deep"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <ul className="mt-8 space-y-1 border-t border-line pt-6">
                {secondary.map((item) => (
                  <li key={item.href}>
                    <Link href={item.href} onClick={() => setOpen(false)} className="block py-2 text-muted hover:text-deep">
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          {footer ? <div className="border-t border-line px-5 py-4">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

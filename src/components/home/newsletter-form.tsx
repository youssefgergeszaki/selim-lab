"use client";

import { useActionState } from "react";
import { subscribeNewsletter, type NewsletterState } from "@/server/actions/newsletter";
import type { Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NewsletterForm({
  locale,
  source,
  labels,
  className,
  tone = "light",
}: {
  locale: Locale;
  source: string;
  labels: { placeholder: string; cta: string; success: string; invalid: string; error: string; tooMany: string };
  className?: string;
  tone?: "light" | "dark";
}) {
  const [state, action, pending] = useActionState<NewsletterState, FormData>(subscribeNewsletter, { status: "idle" });
  const id = `newsletter-${source}`;
  const message =
    state.status === "success"
      ? labels.success
      : state.status === "invalid"
        ? labels.invalid
        : state.status === "rate_limited"
          ? labels.tooMany
          : state.status === "error"
            ? labels.error
            : null;

  if (state.status === "success") {
    return (
      <p role="status" className={cn("text-sm", tone === "dark" ? "text-ivory" : "text-success", className)}>
        {message}
      </p>
    );
  }

  return (
    <form action={action} className={cn("w-full", className)} noValidate>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="source" value={source} />
      <div aria-hidden="true" className="sr-only">
        <label htmlFor={`${id}-company`}>Company</label>
        <input id={`${id}-company`} name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          {labels.placeholder}
        </label>
        <input
          id={id}
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          placeholder={labels.placeholder}
          aria-invalid={state.status === "invalid" || undefined}
          aria-describedby={message ? `${id}-msg` : undefined}
          className={cn(
            "h-11 min-w-0 flex-1 rounded-[var(--radius)] border px-3.5 text-sm focus:outline-none placeholder:text-start",
            tone === "dark"
              ? "border-ivory/30 bg-transparent text-ivory placeholder:text-ivory/60 focus:border-gold"
              : "border-line-strong/70 bg-surface text-deep placeholder:text-subtle focus:border-deep",
          )}
        />
        <Button type="submit" variant={tone === "dark" ? "gold" : "primary"} disabled={pending}>
          {labels.cta}
        </Button>
      </div>
      {message ? (
        <p id={`${id}-msg`} role="alert" className={cn("mt-2 text-sm", tone === "dark" ? "text-gold" : "text-danger")}>
          {message}
        </p>
      ) : null}
    </form>
  );
}

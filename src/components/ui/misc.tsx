import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-[1240px] px-5 sm:px-8", className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "start",
  as: Tag = "h2",
  action,
  id,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: "start" | "center";
  as?: "h1" | "h2" | "h3";
  action?: React.ReactNode;
  id?: string;
}) {
  return (
    <div
      className={cn(
        "mb-10 flex flex-col gap-4 sm:mb-12",
        align === "center" ? "items-center text-center" : "sm:flex-row sm:items-end sm:justify-between",
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "flex flex-col items-center")}>
        {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
        <Tag id={id} className="font-display text-3xl sm:text-4xl">
          {title}
        </Tag>
        {subtitle ? <p className="mt-3 text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  className,
  children,
  role,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  className?: string;
  children: React.ReactNode;
  role?: "alert" | "status";
}) {
  const tones = {
    info: "border-line-gold bg-surface text-deep",
    success: "border-success/30 bg-success/5 text-success",
    warning: "border-warning/30 bg-warning/5 text-warning",
    danger: "border-danger/30 bg-danger/5 text-danger",
  } as const;
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn("rounded-[var(--radius)] border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center border border-line px-6 py-16 text-center", className)}>
      <div className="hairline mb-6" aria-hidden="true" />
      <h2 className="font-display text-2xl">{title}</h2>
      {body ? <p className="mt-3 max-w-md text-muted">{body}</p> : null}
      {action ? <div className="mt-8">{action}</div> : null}
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label} className="text-sm text-subtle">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={`${item.label}-${i}`} className="flex items-center gap-2">
            {item.href ? (
              <Link href={item.href} className="hover:text-deep">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="text-muted">
                {item.label}
              </span>
            )}
            {i < items.length - 1 ? (
              <span aria-hidden="true" className="text-line-strong">
                /
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Badge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "neutral" | "gold" | "success" | "warning" | "danger";
  className?: string;
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-line-strong text-muted",
    gold: "border-line-gold text-accent-strong",
    success: "border-success/40 text-success",
    warning: "border-warning/40 text-warning",
    danger: "border-danger/40 text-danger",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius)] border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

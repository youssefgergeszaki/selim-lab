import Link from "next/link";
import { cn } from "@/lib/utils";

export function AdminHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Panel({ title, children, className, actions }: { title?: string; children: React.ReactNode; className?: string; actions?: React.ReactNode }) {
  return (
    <section className={cn("border border-line bg-ivory p-5 sm:p-6", className)}>
      {title || actions ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title ? <h2 className="font-display text-2xl">{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function StatCard({ label, value, tone = "neutral", href }: { label: string; value: string | number; tone?: "neutral" | "warning" | "danger"; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-subtle">{label}</p>
      <p
        className={cn(
          "ltr-nums mt-2 text-2xl font-medium",
          tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-deep",
        )}
      >
        {value}
      </p>
    </>
  );
  return href ? (
    <Link href={href} className="block border border-line bg-ivory p-5 transition-colors hover:border-line-strong">
      {body}
    </Link>
  ) : (
    <div className="border border-line bg-ivory p-5">{body}</div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto border border-line bg-ivory">
      <table className={cn("w-full min-w-[640px] text-sm", className)}>{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={cn("border-b border-line px-4 py-3 text-start text-xs font-medium text-subtle", className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-line px-4 py-3 align-top", className)}>{children}</td>;
}

/** Arabic + English inputs side by side with correct direction for each. */
export function BilingualFields({
  name,
  labelAr,
  labelEn,
  valueAr,
  valueEn,
  multiline = false,
  rows = 3,
  required = false,
  maxLength,
}: {
  name: string;
  labelAr: string;
  labelEn: string;
  valueAr?: string | null;
  valueEn?: string | null;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
  maxLength?: number;
}) {
  const cls =
    "w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 py-2 text-sm focus:border-deep focus:outline-none";
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(["ar", "en"] as const).map((l) => {
        const id = `${name}_${l}`;
        const value = l === "ar" ? valueAr : valueEn;
        return (
          <div key={l}>
            <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
              {l === "ar" ? labelAr : labelEn}
            </label>
            {multiline ? (
              <textarea id={id} name={id} dir={l === "ar" ? "rtl" : "ltr"} lang={l} rows={rows} defaultValue={value ?? ""} required={required} maxLength={maxLength} className={cls} />
            ) : (
              <input id={id} name={id} dir={l === "ar" ? "rtl" : "ltr"} lang={l} defaultValue={value ?? ""} required={required} maxLength={maxLength} className={cn(cls, "h-10")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}

export function TextField({
  id,
  label,
  defaultValue,
  type = "text",
  required,
  dir,
  placeholder,
  hint,
  maxLength,
  step,
  min,
}: {
  id: string;
  label: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  dir?: "ltr" | "rtl";
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  step?: string;
  min?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        dir={dir}
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        step={step}
        min={min}
        className="h-10 w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 text-sm focus:border-deep focus:outline-none"
      />
      {hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

export function CheckField({ id, label, defaultChecked, value }: { id: string; label: string; defaultChecked?: boolean; value?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={id} value={value ?? "on"} defaultChecked={defaultChecked} className="size-4 accent-[var(--brand-deep)]" />
      {label}
    </label>
  );
}

export function SelectField({
  id,
  label,
  defaultValue,
  options,
}: {
  id: string;
  label: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        className="h-10 w-full rounded-[var(--radius)] border border-line-strong/70 bg-surface px-3 text-sm focus:border-deep focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ImageField({ id, label, hint, currentUrl }: { id: string; label: string; hint: string; currentUrl?: string | null }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="" className="mb-2 h-24 w-auto border border-line object-cover" />
      ) : null}
      <input id={id} name={id} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="block text-sm" />
      <p className="mt-1 text-xs text-subtle">{hint}</p>
    </div>
  );
}

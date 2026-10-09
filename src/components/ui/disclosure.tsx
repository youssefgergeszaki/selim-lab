import { cn } from "@/lib/utils";

/** Accessible, JavaScript-free disclosure built on <details>. Works in RTL and LTR. */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  className,
  titleClassName,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <details className={cn("group border-b border-line", className)} open={defaultOpen}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-start text-deep [&::-webkit-details-marker]:hidden",
          titleClassName,
        )}
      >
        <span>{title}</span>
        <span aria-hidden="true" className="relative size-3 shrink-0">
          <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-deep" />
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-deep transition-transform duration-200 group-open:scale-y-0" />
        </span>
      </summary>
      <div className="pb-6 text-muted">{children}</div>
    </details>
  );
}

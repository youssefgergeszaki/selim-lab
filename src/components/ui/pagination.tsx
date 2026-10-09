import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Server-rendered pagination using query-string links. Arrows flip automatically in RTL. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels: { previous: string; next: string; page: string; of: string; nav?: string };
}) {
  if (pageCount <= 1) return null;
  const pages: number[] = [];
  for (let p = Math.max(1, page - 2); p <= Math.min(pageCount, page + 2); p++) pages.push(p);
  const item = "inline-flex h-10 min-w-10 items-center justify-center border border-line px-3 text-sm transition-colors hover:border-deep";
  return (
    <nav aria-label={labels.nav ?? labels.page} className="mt-14 flex items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={item} rel="prev" aria-label={labels.previous}>
          <ChevronLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      ) : null}
      {pages.map((p) => (
        <Link
          key={p}
          href={hrefFor(p)}
          aria-current={p === page ? "page" : undefined}
          aria-label={`${labels.page} ${p} ${labels.of} ${pageCount}`}
          className={cn(item, "ltr-nums", p === page && "border-deep bg-deep text-ivory hover:bg-deep")}
        >
          {p}
        </Link>
      ))}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={item} rel="next" aria-label={labels.next}>
          <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}

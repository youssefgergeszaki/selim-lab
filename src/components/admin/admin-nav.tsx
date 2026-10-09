"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function AdminNav({ groups, base, label }: { groups: { href: string; label: string }[][]; base: string; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="px-3 pb-4">
      {groups.map((group, i) => (
        <ul key={i} className={cn("flex gap-1 overflow-x-auto lg:flex-col", i > 0 && "mt-2 border-t border-line pt-2 lg:mt-4 lg:pt-4")}>
          {group.map((item) => {
            const active = item.href === base ? pathname === base : pathname.startsWith(item.href);
            return (
              <li key={item.href} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-[var(--radius)] px-3 py-2 text-sm transition-colors",
                    active ? "bg-deep text-ivory" : "text-muted hover:bg-surface-muted hover:text-deep",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      ))}
    </nav>
  );
}

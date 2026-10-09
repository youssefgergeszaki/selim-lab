"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Re-renders the order page periodically while a payment confirmation is pending. */
export function AutoRefresh({ intervalMs = 5000, maxMs = 180_000 }: { intervalMs?: number; maxMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      if (Date.now() - started > maxMs) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs, maxMs]);
  return null;
}

export function CopyLink({ url, label, copiedLabel }: { url: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input
        readOnly
        value={url}
        dir="ltr"
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="h-10 w-full min-w-0 flex-1 border border-line bg-surface px-3 text-xs text-muted"
      />
      <Button
        variant="subtle"
        size="sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard unavailable: the field is still selectable.
          }
        }}
      >
        <span aria-live="polite">{copied ? copiedLabel : label}</span>
      </Button>
    </div>
  );
}

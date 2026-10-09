"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function ProductGallery({
  images,
  labels,
  fallback,
}: {
  images: { url: string; alt: string }[];
  labels: { gallery: string; showImage: string };
  fallback: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  if (images.length === 0) {
    return <div className="relative aspect-[4/5] bg-surface-muted">{fallback}</div>;
  }
  const current = images[Math.min(active, images.length - 1)];
  return (
    <div role="group" aria-label={labels.gallery} className="flex flex-col gap-4">
      <div className="relative aspect-[4/5] overflow-hidden bg-surface-muted">
        <Image
          src={current.url}
          alt={current.alt}
          fill
          loading="eager"
          fetchPriority="high"
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
      {images.length > 1 ? (
        <ul className="grid grid-cols-5 gap-3">
          {images.map((img, i) => (
            <li key={img.url}>
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-label={labels.showImage.replace("{index}", String(i + 1))}
                aria-current={i === active ? "true" : undefined}
                className={cn(
                  "relative block aspect-square w-full overflow-hidden bg-surface-muted ring-offset-2 ring-offset-ivory transition",
                  i === active ? "ring-1 ring-deep" : "opacity-75 hover:opacity-100",
                )}
              >
                <Image src={img.url} alt="" fill sizes="96px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

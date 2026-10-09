import Image from "next/image";
import { cn } from "@/lib/utils";
import logo from "../../../public/brand/selim-lab-logo.png";

/**
 * Renders the approved SELIM LAB logo asset (public/brand/selim-lab-logo.png) unchanged.
 * The source PNG includes generous transparent margins; the frame below only crops that
 * empty margin so the artwork can sit tightly in layouts. Proportions are never altered.
 *
 * - "full": monogram + wordmark + tagline (the complete lockup)
 * - "mark": the SL monogram from the same artwork, for compact spaces such as the header
 *
 * To replace the logo later (e.g. with a transparent PNG or SVG), swap the file and update
 * the crop boxes below if the artwork's position changes.
 */
const SOURCE = { width: 1536, height: 1024 };
const CROPS = {
  full: { x: 270, y: 100, w: 1000, h: 820 },
  mark: { x: 540, y: 103, w: 455, h: 541 },
} as const;

export function BrandLogo({
  variant = "full",
  className,
  label = "SELIM LAB",
  eager = false,
}: {
  variant?: keyof typeof CROPS;
  className?: string;
  label?: string;
  /** Load immediately with high priority (above-the-fold usage such as the header). */
  eager?: boolean;
}) {
  const crop = CROPS[variant];
  return (
    <span
      className={cn("relative block overflow-hidden", className)}
      style={{ aspectRatio: `${crop.w} / ${crop.h}` }}
    >
      <Image
        src={logo}
        alt={label}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        sizes={variant === "mark" ? "160px" : "(max-width: 640px) 100vw, 640px"}
        style={{
          position: "absolute",
          left: `${(-crop.x / crop.w) * 100}%`,
          top: `${(-crop.y / crop.h) * 100}%`,
          width: `${(SOURCE.width / crop.w) * 100}%`,
          maxWidth: "none",
          height: "auto",
        }}
      />
    </span>
  );
}

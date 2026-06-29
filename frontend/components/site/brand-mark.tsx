"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Transparent (background-removed) CN Tower line-art served from /public.
 * Rendered black on light surfaces and inverted to white in dark mode.
 * Falls back to the built-in glyph if the file is missing.
 */
const LOGO_SRC = "/cntower-mark.png";
const LOGO_RATIO = 66 / 250; // intrinsic width / height of the trimmed mark

interface BrandMarkProps {
  className?: string;
  /** Size of the square logo in pixels. */
  size?: number;
  withWordmark?: boolean;
  /** Tailwind text size class for the wordmark. */
  wordmarkClassName?: string;
}

/**
 * Brand logo: uses a custom image at {@link LOGO_SRC} when available, otherwise
 * falls back to the built-in CN Tower glyph in a gradient tile. Optionally
 * followed by the TorontoGuessr wordmark.
 */
export function BrandMark({
  className,
  size = 36,
  withWordmark = false,
  wordmarkClassName,
}: BrandMarkProps) {
  // Default to the built-in glyph and only swap in the custom image once it has
  // verifiably loaded, so a missing file never flashes a broken-image icon.
  const [hasLogo, setHasLogo] = useState(false);

  useEffect(() => {
    const probe = new window.Image();
    probe.onload = () => setHasLogo(true);
    probe.onerror = () => setHasLogo(false);
    probe.src = LOGO_SRC;
  }, []);

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {hasLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={LOGO_SRC}
          alt=""
          width={Math.round(size * LOGO_RATIO)}
          height={size}
          style={{ height: size, width: "auto" }}
          className="shrink-0 select-none object-contain dark:invert"
          aria-hidden="true"
        />
      ) : (
        <span
          className="relative grid shrink-0 place-items-center rounded-[30%] bg-gradient-to-br from-toronto-azure to-toronto-sky text-white shadow-glow ring-1 ring-inset ring-white/20"
          style={{ width: size, height: size }}
          aria-hidden="true"
        >
          <TowerGlyph className="h-[62%] w-[62%]" />
        </span>
      )}
      {withWordmark && (
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground",
            wordmarkClassName ?? "text-lg",
          )}
        >
          Toronto<span className="text-toronto-red">Guessr</span>
        </span>
      )}
    </span>
  );
}

/** Minimal stylized CN Tower mark (fallback when no logo image is provided). */
export function TowerGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* antenna */}
      <path
        d="M12 1.5V5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* main shaft */}
      <path
        d="M10.4 22V9.2C10.4 8 11 7 12 7s1.6 1 1.6 2.2V22"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* sky pod */}
      <path
        d="M9 11.2c0-1 1.35-1.7 3-1.7s3 .7 3 1.7-1.35 1.6-3 1.6-3-.6-3-1.6Z"
        fill="currentColor"
      />
      {/* base */}
      <path
        d="M8.5 22h7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

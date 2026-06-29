import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  /** Size of the square logo tile in pixels. */
  size?: number;
  withWordmark?: boolean;
  /** Tailwind text size class for the wordmark. */
  wordmarkClassName?: string;
}

/**
 * CN Tower–inspired logo glyph rendered inside a rounded gradient tile,
 * optionally followed by the TorontoGuessr wordmark.
 */
export function BrandMark({
  className,
  size = 36,
  withWordmark = false,
  wordmarkClassName,
}: BrandMarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="relative grid shrink-0 place-items-center rounded-[30%] bg-gradient-to-br from-toronto-azure to-toronto-sky text-white shadow-glow ring-1 ring-inset ring-white/20"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <TowerGlyph className="h-[62%] w-[62%]" />
      </span>
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

/** Minimal stylized CN Tower mark. */
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

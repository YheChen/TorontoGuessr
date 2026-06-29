import { cn } from "@/lib/utils";

/**
 * Branded loading spinner: a sweeping azure arc over a faint track ring.
 */
export function Spinner({
  className,
  size = 28,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 50 50" className="h-full w-full">
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="hsl(var(--muted-foreground) / 0.2)"
          strokeWidth="5"
        />
        <circle
          cx="25"
          cy="25"
          r="20"
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray="90 150"
          className="origin-center animate-spin"
          style={{ animationDuration: "0.9s" }}
        />
      </svg>
    </span>
  );
}

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/site/count-up";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Render a static string instead of an animated number. */
  display?: string;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  decimals = 0,
  prefix,
  suffix,
  display,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "surface-card group relative overflow-hidden rounded-2xl p-5 sm:p-6",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-primary/10 blur-2xl transition-opacity duration-300 group-hover:opacity-80"
        aria-hidden="true"
      />
      <span className="grid size-10 place-items-center rounded-xl bg-accent text-primary">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-3xl font-bold tracking-tight tabular sm:text-4xl">
        {display ?? (
          <CountUp
            value={value}
            decimals={decimals}
            prefix={prefix}
            suffix={suffix}
          />
        )}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

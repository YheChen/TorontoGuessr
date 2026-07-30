"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { readStreak, type StreakState } from "@/lib/streak";

interface StreakBadgeProps {
  /**
   * Pass a streak when the caller already has one (the summary screen records
   * the play and knows the result). Omit it to read the stored streak instead,
   * which is what the landing page does.
   */
  streak?: StreakState | null;
  className?: string;
  /** Show the best run alongside the current one. */
  showBest?: boolean;
}

export function StreakBadge({
  streak,
  className,
  showBest = false,
}: StreakBadgeProps) {
  const [stored, setStored] = useState<StreakState | null>(null);

  // localStorage is client-only, so read after mount. Until then this renders
  // nothing, which also keeps the server and client markup identical.
  useEffect(() => {
    if (streak === undefined) {
      setStored(readStreak());
    }
  }, [streak]);

  const value = streak === undefined ? stored : streak;
  if (!value || value.current < 1) {
    return null;
  }

  const days = value.current === 1 ? "1 day" : `${value.current} days`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-toronto-gold/15 px-3 py-1.5 text-xs font-semibold text-toronto-gold ring-1 ring-inset ring-toronto-gold/30",
        className,
      )}
      title={
        showBest && value.best > value.current
          ? `Best run: ${value.best} days`
          : undefined
      }
    >
      <Flame className="size-3.5" aria-hidden="true" />
      {days} in a row
      {showBest && value.best > value.current && (
        <span className="font-medium text-toronto-gold/70">
          best {value.best}
        </span>
      )}
    </span>
  );
}

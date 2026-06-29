import { Crown, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import { CountUp } from "@/components/site/count-up";
import type { LeaderboardEntry } from "@/lib/types";

interface PodiumSlot {
  entry: LeaderboardEntry;
  rank: number;
}

const MEDAL: Record<
  number,
  { ring: string; chip: string; text: string; bar: string; label: string }
> = {
  1: {
    ring: "ring-medal-gold/45",
    chip: "bg-medal-gold/15 text-medal-gold ring-medal-gold/35",
    text: "text-medal-gold",
    bar: "from-medal-gold/25",
    label: "Champion",
  },
  2: {
    ring: "ring-medal-silver/45",
    chip: "bg-medal-silver/15 text-medal-silver ring-medal-silver/35",
    text: "text-medal-silver",
    bar: "from-medal-silver/20",
    label: "Runner-up",
  },
  3: {
    ring: "ring-medal-bronze/45",
    chip: "bg-medal-bronze/15 text-medal-bronze ring-medal-bronze/35",
    text: "text-medal-bronze",
    bar: "from-medal-bronze/20",
    label: "Third",
  },
};

export function LeaderboardPodium({
  entries,
}: {
  entries: LeaderboardEntry[];
}) {
  const top = entries.slice(0, 3).map((entry, index) => ({
    entry,
    rank: index + 1,
  }));

  // Display order puts the champion in the middle on larger screens.
  const order: PodiumSlot[] =
    top.length >= 3 ? [top[1], top[0], top[2]] : top.length === 2 ? [top[1], top[0]] : top;

  return (
    <div className="grid items-end gap-3 sm:gap-4" style={{ gridTemplateColumns: `repeat(${order.length}, minmax(0, 1fr))` }}>
      {order.map(({ entry, rank }) => {
        const medal = MEDAL[rank];
        const isFirst = rank === 1;
        return (
          <div
            key={entry.id}
            className={cn(
              "surface-card relative overflow-hidden rounded-2xl px-4 text-center ring-1",
              medal.ring,
              isFirst ? "pb-6 pt-8 sm:pb-8" : "pb-5 pt-6",
            )}
          >
            <div
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b to-transparent",
                medal.bar,
              )}
              aria-hidden="true"
            />
            <div className="relative">
              <span
                className={cn(
                  "mx-auto grid place-items-center rounded-full ring-1 ring-inset",
                  medal.chip,
                  isFirst ? "size-12" : "size-10",
                )}
              >
                {isFirst ? (
                  <Crown className="size-5" />
                ) : (
                  <Medal className="size-4" />
                )}
              </span>
              <p
                className={cn(
                  "mt-3 text-xs font-semibold uppercase tracking-[0.12em]",
                  medal.text,
                )}
              >
                #{rank} · {medal.label}
              </p>
              <p
                className={cn(
                  "mt-1 truncate font-semibold",
                  isFirst ? "text-lg" : "text-base",
                )}
                title={entry.username}
              >
                {entry.username}
              </p>
              <p
                className={cn(
                  "mt-1 font-bold tabular",
                  isFirst ? "text-3xl sm:text-4xl" : "text-2xl",
                )}
              >
                <CountUp value={entry.totalScore} />
              </p>
              <p className="text-xs text-muted-foreground">points</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

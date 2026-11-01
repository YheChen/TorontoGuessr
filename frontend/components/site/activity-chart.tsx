import { formatDay } from "@/lib/date-toronto";
import { monthTicks } from "@/lib/home-stats";
import type { DailyGameStatsEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Plot height in viewBox units. The width is one unit per day. */
const PLOT_HEIGHT = 100;

/** Share of each day's slot left empty, so neighbouring bars stay distinct. */
const BAR_GAP = 0.3;

/** Room above the busiest day's bar for its label. */
const HEADROOM = 1.25;

/** A month label starting past this fraction of the width would run off the edge. */
const LAST_TICK_POSITION = 0.94;

/**
 * Gridline spacing: the largest 1, 2 or 5 times a power of ten that fits in
 * `value`, and never under one game.
 */
function gridStep(value: number): number {
  if (value <= 1) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
}

/** One path holding a bar per day, far lighter than a rect per day. */
function barsPath(values: number[], ceiling: number): string {
  const width = 1 - BAR_GAP;
  return values
    .map((value, index) => {
      if (value <= 0) {
        return "";
      }
      const x = (index + BAR_GAP / 2).toFixed(2);
      const top = (PLOT_HEIGHT - (value / ceiling) * PLOT_HEIGHT).toFixed(2);
      return `M${x} ${PLOT_HEIGHT}V${top}h${width}V${PLOT_HEIGHT}Z`;
    })
    .join("");
}

interface ActivityChartProps {
  days: DailyGameStatsEntry[];
  busiestDay: DailyGameStatsEntry;
  className?: string;
}

/**
 * Games per day as bars: games started faint, games played to the end solid
 * inside them.
 *
 * Plain server-rendered SVG rather than recharts, so the landing page ships no
 * chart code to the browser. The SVG stretches to fill its box, so the parts
 * that must not stretch (every label, and the gridlines, which should stay a
 * crisp hairline) are HTML laid over it by percentage.
 */
export function ActivityChart({
  days,
  busiestDay,
  className,
}: ActivityChartProps) {
  const count = days.length;
  const ceiling = busiestDay.gamesStarted * HEADROOM;
  const step = gridStep(busiestDay.gamesStarted / 2);
  const gridlines: number[] = [];
  for (let value = step; value <= busiestDay.gamesStarted; value += step) {
    gridlines.push(value);
  }

  const busiestIndex = days.findIndex((day) => day.date === busiestDay.date);
  const peakX = (busiestIndex + 0.5) / count;
  const peakAlign = peakX > 0.7 ? "end" : peakX < 0.3 ? "start" : "center";
  const ticks = monthTicks(days).filter(
    (tick) => tick.index / count <= LAST_TICK_POSITION,
  );

  const first = days[0];
  const last = days.at(-1);
  const summary =
    first && last
      ? `Games started per day from ${formatDay(first.date)} to ${formatDay(last.date)}. ` +
        `The busiest day was ${formatDay(busiestDay.date)}, with ${busiestDay.gamesStarted.toLocaleString("en-US")}.`
      : "Games started per day.";

  return (
    <div className={cn("relative", className)}>
      <div className="relative h-52 sm:h-64 lg:h-80">
        {gridlines.map((value) => (
          <div
            key={value}
            aria-hidden="true"
            className="absolute inset-x-0 border-t border-dashed border-border"
            style={{ bottom: `${(value / ceiling) * 100}%` }}
          >
            <span className="absolute bottom-1 left-0 text-[11px] leading-none text-muted-foreground tabular">
              {value.toLocaleString("en-US")}
            </span>
          </div>
        ))}

        <svg
          viewBox={`0 0 ${count} ${PLOT_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={summary}
          className="absolute inset-0 size-full"
        >
          <path
            d={barsPath(
              days.map((day) => day.gamesStarted),
              ceiling,
            )}
            className="fill-primary/25"
          />
          <path
            d={barsPath(
              days.map((day) => day.gamesFinished),
              ceiling,
            )}
            className="fill-primary"
          />
        </svg>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: `${peakX * 100}%`,
            top: `${(1 - busiestDay.gamesStarted / ceiling) * 100}%`,
          }}
        >
          <span className="absolute bottom-0 left-0 h-1.5 w-px -translate-x-1/2 bg-foreground/50" />
          <span
            className={cn(
              "absolute bottom-2.5 whitespace-nowrap text-xs font-medium tabular",
              peakAlign === "end" && "right-0 translate-x-1",
              peakAlign === "start" && "left-0 -translate-x-1",
              peakAlign === "center" && "left-0 -translate-x-1/2",
            )}
          >
            {busiestDay.gamesStarted.toLocaleString("en-US")} on{" "}
            {formatDay(busiestDay.date)}
          </span>
        </div>
      </div>

      <div aria-hidden="true" className="relative h-7 border-t border-border">
        {ticks.map((tick) => (
          <span
            key={tick.index}
            className="absolute top-2 text-xs leading-none text-muted-foreground"
            style={{ left: `${(tick.index / count) * 100}%` }}
          >
            {tick.label}
          </span>
        ))}
      </div>
    </div>
  );
}

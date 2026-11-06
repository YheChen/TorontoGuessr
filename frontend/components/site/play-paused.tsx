import Link from "next/link";
import { CirclePause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TITLE = "Games are paused for now";

const EXPLANATION =
  "TorontoGuessr runs on Google Street View, and I need to sort out the Google Cloud billing behind it before games can start again. The leaderboard and stats still work.";

/** The home page's notice, shown above the hero while play is paused. */
export function PlayPausedNotice({ className }: { className?: string }) {
  return (
    <div
      data-testid="play-paused"
      className={cn(
        "flex gap-3 rounded-xl border border-toronto-gold/40 bg-toronto-gold/10 p-4 sm:p-5",
        className,
      )}
    >
      <CirclePause
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-toronto-gold"
      />
      <div>
        <p className="font-semibold">{TITLE}</p>
        <p className="mt-1 text-pretty leading-relaxed text-muted-foreground">
          {EXPLANATION}
        </p>
      </div>
    </div>
  );
}

/**
 * What /game and /lobby show in place of the game while play is paused, so a
 * shared challenge link, a lobby code or an old bookmark gets the same
 * explanation as the home page instead of a game that cannot load.
 */
export function PlayPausedScreen() {
  return (
    <section data-testid="play-paused" className="container py-16 sm:py-24">
      <div className="max-w-xl">
        <CirclePause aria-hidden="true" className="size-8 text-toronto-gold" />
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
          {TITLE}
        </h1>
        <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
          {EXPLANATION}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-xl">
            <Link href="/leaderboard">See the leaderboard</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-xl">
            <Link href="/">Back to the home page</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

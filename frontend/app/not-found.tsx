import Link from "next/link";
import { Home, Play, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="container flex min-h-[70vh] flex-col items-center justify-center py-16 text-center">
      <div className="animate-scale-in relative grid size-24 place-items-center rounded-3xl bg-accent text-primary shadow-soft">
        <span
          className="absolute inset-0 rounded-3xl bg-map-grid-fine opacity-60"
          aria-hidden="true"
        />
        <Compass className="relative size-11" />
      </div>

      <p className="mt-8 font-mono-accent text-sm font-semibold uppercase tracking-[0.2em] text-primary">
        404 · Off the map
      </p>
      <h1 className="mt-3 text-balance text-4xl font-bold tracking-tight sm:text-5xl">
        You've wandered off the grid
      </h1>
      <p className="mt-4 max-w-md text-pretty text-muted-foreground">
        This street isn't on our map. Let's get you back to somewhere familiar.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg" className="rounded-xl shadow-glow">
          <Link href="/">
            <Home className="size-4" />
            Back home
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="rounded-xl">
          <Link href="/game">
            <Play className="size-4" />
            Play a game
          </Link>
        </Button>
      </div>
    </section>
  );
}

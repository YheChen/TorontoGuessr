import Link from "next/link";
import {
  Play,
  Trophy,
  Eye,
  Crosshair,
  ArrowRight,
  Timer,
  Target,
  Map as MapIcon,
  Building2,
  CalendarDays,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";
import { GameplayPreview } from "@/components/site/gameplay-preview";
import { StatCard } from "@/components/site/stat-card";
import { Skyline } from "@/components/site/skyline";

const FEATURES = [
  {
    icon: Eye,
    title: "Real Street View",
    description:
      "Authentic 360° panoramas pulled straight from Toronto's streets. Pan, zoom, and explore for clues.",
  },
  {
    icon: Crosshair,
    title: "Pin your guess",
    description:
      "Click the map to drop your marker. The closer you land, the more you score, up to 5,000 points a round.",
  },
  {
    icon: Trophy,
    title: "Climb the board",
    description:
      "Save your run and compete on daily, weekly, monthly, and all-time Toronto leaderboards.",
  },
] as const;

const STEPS = [
  {
    title: "Look around",
    description: "Pan and zoom the panorama to take in the whole scene.",
  },
  {
    title: "Read the city",
    description: "Spot landmarks, transit, signage, and architecture.",
  },
  {
    title: "Drop your pin",
    description: "Click the map where you think the photo was taken.",
  },
  {
    title: "Score & climb",
    description: "Earn points by distance across five rounds.",
  },
] as const;

export default function Home() {
  return (
    <>
      {/* ───────────────────────── Hero ───────────────────────── */}
      <section className="container relative pt-12 sm:pt-16 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="size-1.5 rounded-full bg-toronto-red" />
              A street-guessing game for the 6ix
            </span>

            <h1 className="mt-6 text-balance text-5xl font-bold leading-[1.04] tracking-tight sm:text-6xl xl:text-7xl">
              How well do you know{" "}
              <span className="text-gradient">Toronto?</span>
            </h1>

            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
              Drop into a random Toronto street, read the signs, skyline, and
              storefronts, then pin your best guess. Five rounds, one city,
              pure local knowledge.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="xl" className="rounded-2xl shadow-glow">
                <Link href="/game">
                  <Play className="size-5" />
                  Play now
                </Link>
              </Button>
              <Button
                asChild
                size="xl"
                className="rounded-2xl bg-toronto-red text-white hover:bg-toronto-red/90"
              >
                <Link href="/game?mode=daily">
                  <CalendarDays className="size-5" />
                  Daily challenge
                </Link>
              </Button>
              <Button
                asChild
                size="xl"
                variant="outline"
                className="rounded-2xl"
              >
                <Link href="/leaderboard">
                  <Trophy className="size-5" />
                  View leaderboard
                </Link>
              </Button>
            </div>

            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {["No sign-up needed", "5 rounds per game", "Live leaderboard"].map(
                (item) => (
                  <li key={item} className="inline-flex items-center gap-2">
                    <Check className="size-4 text-success" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          <div className="relative animate-fade-up delay-150">
            <div
              className="absolute -inset-6 -z-10 rounded-[2rem] bg-primary/20 blur-3xl"
              aria-hidden="true"
            />
            <div className="animate-float">
              <GameplayPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────── Features ─────────────────────── */}
      <section className="container py-20 sm:py-28">
        <div className="grid gap-6 md:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={index * 90}>
              <article className="surface-card group h-full rounded-2xl p-7 transition-transform duration-300 hover:-translate-y-1">
                <span className="grid size-12 place-items-center rounded-2xl bg-accent text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-6" />
                </span>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─────────────────────── How to play ─────────────────────── */}
      <section className="container pb-20 sm:pb-28">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
          <Reveal>
            <SectionHeading
              eyebrow="How to play"
              title="Four steps to your first score"
              description="No tutorial required. Start a game and you'll be guessing within seconds."
            />
            <div className="mt-8">
              <Button asChild size="lg" className="rounded-xl">
                <Link href="/game">
                  Start a game
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </Reveal>

          <ol className="grid gap-4 sm:grid-cols-2">
            {STEPS.map((step, index) => (
              <Reveal as="li" key={step.title} delay={index * 90}>
                <div className="surface-card h-full rounded-2xl p-6">
                  <span className="font-mono-accent text-sm font-semibold text-primary">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-3 text-base font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ─────────────────────── Stats ─────────────────────── */}
      <section className="container pb-20 sm:pb-28">
        <Reveal>
          <SectionHeading
            align="center"
            eyebrow="By the numbers"
            title="The game at a glance"
            className="mx-auto items-center text-center"
          />
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
          <Reveal delay={0}>
            <StatCard icon={MapIcon} label="Rounds per game" value={5} />
          </Reveal>
          <Reveal delay={90}>
            <StatCard
              icon={Target}
              label="Max points per round"
              value={5000}
            />
          </Reveal>
          <Reveal delay={180}>
            <StatCard
              icon={Timer}
              label="Seconds per round"
              value={60}
              suffix="s"
            />
          </Reveal>
          <Reveal delay={270}>
            <StatCard
              icon={Building2}
              label="Neighborhoods"
              value={8}
              display="8+"
            />
          </Reveal>
        </div>
      </section>

      {/* ─────────────────────── Final CTA ─────────────────────── */}
      <section className="container pb-24">
        <Reveal>
          <div className="surface-card relative overflow-hidden rounded-3xl px-6 py-14 text-center sm:px-12 sm:py-20">
            <div
              className="absolute inset-0 -z-10 bg-grid-fade"
              aria-hidden="true"
            />
            <div
              className="absolute inset-x-0 bottom-0 -z-10 text-primary/10 dark:text-white/[0.06]"
              aria-hidden="true"
            >
              <Skyline className="h-32 sm:h-44" />
            </div>

            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to test your local knowledge?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
              Jump into a fresh five-round game. No account, no setup, just you
              and the streets of Toronto.
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="xl" className="rounded-2xl shadow-glow">
                <Link href="/game">
                  <Play className="size-5" />
                  Play TorontoGuessr
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

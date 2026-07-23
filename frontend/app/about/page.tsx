import type { Metadata } from "next";
import Link from "next/link";
import {
  Eye,
  Crosshair,
  Target,
  Trophy,
  Play,
  Code2,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "@/components/site/section-heading";

export const metadata: Metadata = {
  title: "About",
  description:
    "How TorontoGuessr works: gameplay, scoring, the neighborhoods, and the tech behind the game.",
};

const STEPS = [
  {
    icon: Eye,
    title: "Explore the panorama",
    body: "Each round drops you into a real Toronto Street View. Pan, zoom, and look for clues: signage, transit, storefronts, and skyline.",
  },
  {
    icon: Crosshair,
    title: "Drop your pin",
    body: "Click the interactive map where you think the photo was taken. Reposition as many times as you like before the timer runs out.",
  },
  {
    icon: Target,
    title: "Score by distance",
    body: "The closer your pin lands to the real spot, the more you score, up to 5,000 points per round.",
  },
  {
    icon: Trophy,
    title: "Finish & climb",
    body: "Play five rounds, save your name, and compete on the daily, weekly, monthly, and all-time leaderboards.",
  },
] as const;

const SCORING = [
  { range: "Within 100 m", points: "5,000 pts", tone: "text-success" },
  { range: "A few blocks", points: "Partial credit", tone: "text-primary" },
  { range: "Right neighborhood", points: "Solid points", tone: "text-medal-gold" },
  { range: "Over 2 km away", points: "0 pts", tone: "text-muted-foreground" },
] as const;

const TECH = [
  "Google Street View API",
  "Google Maps JavaScript API",
  "Custom scoring backend",
  "Next.js & React",
  "Supabase",
] as const;

const NEIGHBORHOODS = [
  "Financial District",
  "Entertainment District",
  "Chinatown",
  "Kensington Market",
  "Queen West",
  "Distillery District",
  "Yorkville",
  "Harbourfront",
] as const;

export default function About() {
  return (
    <section className="container py-12 sm:py-16">
      <Reveal>
        <SectionHeading
          as="h1"
          eyebrow="About"
          title="How TorontoGuessr works"
          description="A street-guessing game built around real Toronto Street View imagery. Read the city, drop your pin, and find out how well you really know the 6ix."
        />
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg" className="rounded-xl shadow-glow">
            <Link href="/game">
              <Play className="size-4" />
              Start playing
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-xl">
            <Link href="/leaderboard">
              <Trophy className="size-4" />
              View leaderboard
            </Link>
          </Button>
        </div>
      </Reveal>

      {/* Steps */}
      <div className="mt-14 grid gap-5 sm:grid-cols-2">
        {STEPS.map((step, index) => (
          <Reveal key={step.title} delay={index * 80}>
            <article className="surface-card flex h-full gap-4 rounded-2xl p-6">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                <step.icon className="size-5" />
              </span>
              <div>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <span className="font-mono-accent text-sm text-muted-foreground">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>

      {/* Scoring + tech */}
      <div className="mt-12 grid gap-5 lg:grid-cols-2">
        <Reveal>
          <div className="surface-card h-full rounded-2xl p-6 sm:p-7">
            <div className="flex items-center gap-2">
              <Target className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">How scoring works</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Every round is scored purely on how close your guess is to the
              true location.
            </p>
            <ul className="mt-5 divide-y divide-border/60">
              {SCORING.map((row) => (
                <li
                  key={row.range}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span className="text-muted-foreground">{row.range}</span>
                  <span className={`font-semibold ${row.tone}`}>
                    {row.points}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="surface-card h-full rounded-2xl p-6 sm:p-7">
            <div className="flex items-center gap-2">
              <Code2 className="size-5 text-primary" />
              <h3 className="text-lg font-semibold">Built with</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              TorontoGuessr stitches together a few technologies to keep
              gameplay fast and fair.
            </p>
            <ul className="mt-5 flex flex-wrap gap-2">
              {TECH.map((item) => (
                <li key={item}>
                  <Badge variant="secondary" className="rounded-lg px-3 py-1.5">
                    {item}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>

      {/* Neighborhoods */}
      <Reveal>
        <div className="surface-card mt-12 overflow-hidden rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <MapPin className="size-5 text-toronto-red" />
            <h3 className="text-lg font-semibold">Where you&apos;ll explore</h3>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The game focuses on downtown Toronto and the surrounding
            neighborhoods, each with its own architecture, signage, and street
            life to read.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2.5">
            {NEIGHBORHOODS.map((name) => (
              <li
                key={name}
                className="rounded-full border border-border/70 bg-card/60 px-4 py-2 text-sm font-medium text-foreground/90"
              >
                {name}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </section>
  );
}

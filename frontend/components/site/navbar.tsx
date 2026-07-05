"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Trophy, Info, Play, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/site/brand-mark";

const NAV_LINKS = [
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/about", label: "About", icon: Info },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-shadow duration-300",
        scrolled
          ? "glass-strong shadow-soft"
          : "border-b border-transparent bg-background/40 backdrop-blur-sm",
      )}
    >
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="group flex items-center rounded-lg outline-none"
          aria-label="TorontoGuessr home"
        >
          <BrandMark
            withWordmark
            size={34}
            wordmarkClassName="text-lg sm:text-xl transition-colors group-hover:text-foreground"
          />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute inset-0 rounded-full bg-accent" />
                )}
                <span className="relative">{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            asChild
            size="sm"
            className="hidden rounded-full px-5 shadow-glow sm:inline-flex"
          >
            <Link href="/game">
              <Play className="size-4" />
              Play
            </Link>
          </Button>

          {/* Mobile menu trigger */}
          <Button
            variant="outline"
            size="icon"
            className="rounded-full md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile panel */}
      {open && (
        <div className="md:hidden">
          <div className="container animate-fade-in pb-4">
            <nav className="glass-strong flex flex-col gap-1 rounded-2xl p-2 shadow-elevated">
              {NAV_LINKS.map((link) => {
                const active = isActive(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {link.label}
                  </Link>
                );
              })}
              <Button asChild className="mt-1 w-full rounded-xl">
                <Link href="/game">
                  <Play className="size-4" />
                  Play now
                </Link>
              </Button>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

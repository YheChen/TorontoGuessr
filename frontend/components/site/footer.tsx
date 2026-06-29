import Link from "next/link";
import { Github, MapPin } from "lucide-react";
import { BrandMark } from "@/components/site/brand-mark";
import { FooterBackdrop } from "@/components/site/footer-backdrop";

const FOOTER_LINKS: Array<{
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}> = [
  {
    title: "Game",
    links: [
      { label: "Play", href: "/game" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: "https://github.com/YheChen", external: true },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-auto overflow-hidden border-t border-border/70">
      <FooterBackdrop />
      <div className="container relative z-10 py-12">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <BrandMark withWordmark size={36} wordmarkClassName="text-xl" />
            <p className="mt-4 text-pretty text-sm leading-relaxed text-muted-foreground">
              A street-guessing game for Toronto. Read the city, drop your pin,
              and see how well you really know the 6ix.
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 text-toronto-red" />
              Made in Toronto, Canada
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:gap-16">
            {FOOTER_LINKS.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <Github className="size-3.5" />
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Yanzhen Chen. All rights reserved.</span>
          <span>Built with Next.js · Google Street View</span>
        </div>
      </div>
    </footer>
  );
}

import { MapPin } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export default function Header() {
  return (
    <header className="border-b border-border/70 bg-background/85 text-foreground shadow-sm backdrop-blur dark:border-none dark:bg-[#00205B] dark:text-white dark:shadow-md dark:backdrop-blur-none">
      <div className="container mx-auto flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-[#CF142B]" />
          <h1 className="text-xl font-bold">TorontoGuessr</h1>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden gap-6 md:flex">
            <Link
              href="/"
              className="transition-colors hover:text-primary dark:hover:text-[#CF142B]"
            >
              Play
            </Link>
            <Link
              href="/leaderboard"
              className="transition-colors hover:text-primary dark:hover:text-[#CF142B]"
            >
              Leaderboard
            </Link>
            <Link
              href="/about"
              className="transition-colors hover:text-primary dark:hover:text-[#CF142B]"
            >
              About
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

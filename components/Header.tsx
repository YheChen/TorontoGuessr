import { MapPin } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export default function Header() {
  return (
    <header className="bg-white text-[#00205B] shadow-md dark:bg-[#00205B] dark:text-white">
      <div className="container mx-auto flex justify-between items-center p-4">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-[#CF142B]" />
          <h1 className="text-xl font-bold">Toronto GeoGuessr</h1>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden md:flex gap-6">
            <Link
              href="/"
              className="transition-colors hover:text-[#CF142B] dark:hover:text-[#CF142B]"
            >
              Play
            </Link>
            <Link
              href="/leaderboard"
              className="transition-colors hover:text-[#CF142B] dark:hover:text-[#CF142B]"
            >
              Leaderboard
            </Link>
            <Link
              href="/about"
              className="transition-colors hover:text-[#CF142B] dark:hover:text-[#CF142B]"
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

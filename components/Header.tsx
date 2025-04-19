import { MapPin } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"

export default function Header() {
  return (
    <header className="bg-[#00205B] text-white p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MapPin className="h-6 w-6 text-[#CF142B]" />
          <h1 className="text-xl font-bold">Toronto GeoGuessr</h1>
        </div>
        <div className="flex items-center gap-4">
          <nav className="hidden md:flex gap-6">
            <Link href="/" className="hover:text-[#CF142B] transition-colors">
              Play
            </Link>
            <Link href="/leaderboard" className="hover:text-[#CF142B] transition-colors">
              Leaderboard
            </Link>
            <Link href="/about" className="hover:text-[#CF142B] transition-colors">
              About
            </Link>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { MapPin } from "lucide-react";
import Header from "@/components/Header";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-black dark:bg-[#001233] dark:text-white">
      <Header />
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-8 flex items-center gap-2">
            <MapPin className="h-10 w-10 text-[#CF142B]" />
            <h1 className="text-4xl font-bold">Toronto GeoGuessr</h1>
          </div>

          <p className="mb-8 max-w-2xl text-lg">
            Test your knowledge of Toronto! View street scenes with blurred
            signs and guess the location. How well do you know the 6ix?
          </p>

          <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
            {/* Start Game Card */}
            <Card className="border bg-white text-black shadow-md dark:bg-[#00205B] dark:text-white dark:border-[#003566]">
              <CardHeader>
                <CardTitle>Play Game</CardTitle>
                <CardDescription className="text-gray-600 dark:text-blue-100">
                  Start a new game with 5 rounds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <img
                  src="/TorontoGuessrThumbnail.webp?height=200&width=400"
                  alt="Toronto skyline"
                  className="rounded-md w-full h-48 object-cover"
                />
              </CardContent>
              <CardFooter>
                <Link href="/game" className="w-full">
                  <Button className="w-full bg-[#CF142B] hover:bg-[#B01226] text-white">
                    Start Game
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* How to Play Card */}
            <Card className="border bg-white text-black shadow-md dark:bg-[#00205B] dark:text-white dark:border-[#003566]">
              <CardHeader>
                <CardTitle>How to Play</CardTitle>
                <CardDescription className="text-gray-600 dark:text-blue-100">
                  Game rules and scoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-left">
                <ol className="list-decimal pl-5 space-y-2">
                  <li>You'll see a Toronto street scene with signs blurred</li>
                  <li>Use context clues to guess the location</li>
                  <li>Click on the map to place your guess</li>
                  <li>Score is based on distance from actual location</li>
                  <li>Complete 5 rounds to finish a game</li>
                </ol>
              </CardContent>
              <CardFooter>
                <Link href="/about" className="w-full">
                  <Button
                    variant="outline"
                    className="w-full border text-[#00205B] hover:bg-gray-100 dark:bg-[#001845] dark:text-white dark:border-white/50 dark:hover:bg-[#00205B]"
                  >
                    Learn More
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

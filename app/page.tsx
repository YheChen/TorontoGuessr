import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { MapPin } from "lucide-react"
import Header from "@/components/Header"

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground dark:bg-gradient-to-b dark:from-[#00205B] dark:to-[#001233] light:bg-gray-100">
      <Header />
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-8 flex items-center gap-2">
            <MapPin className="h-10 w-10 text-[#CF142B]" />
            <h1 className="text-4xl font-bold dark:text-white light:text-[#00205B]">Toronto GeoGuessr</h1>
          </div>

          <p className="mb-8 max-w-2xl text-lg dark:text-white light:text-gray-700">
            Test your knowledge of Toronto! View street scenes with blurred signs and guess the location. How well do
            you know the 6ix?
          </p>

          <div className="grid w-full max-w-4xl gap-6 md:grid-cols-2">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 dark:bg-white/10 dark:border-white/20 light:bg-[#00205B] light:border-[#001233] light:border-2 light:shadow-lg light:shadow-blue-900/20">
              <CardHeader>
                <CardTitle className="text-white dark:text-white light:text-white">Play Game</CardTitle>
                <CardDescription className="text-gray-300 dark:text-gray-300 light:text-blue-200">
                  Start a new game with 5 rounds
                </CardDescription>
              </CardHeader>
              <CardContent>
                <img
                  src="/placeholder.svg?height=200&width=400"
                  alt="Toronto skyline"
                  className="rounded-md w-full h-48 object-cover"
                />
              </CardContent>
              <CardFooter>
                <Link href="/game" className="w-full">
                  <Button className="w-full bg-[#CF142B] hover:bg-[#B01226]">Start Game</Button>
                </Link>
              </CardFooter>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 dark:bg-white/10 dark:border-white/20 light:bg-[#00205B] light:border-[#001233] light:border-2 light:shadow-lg light:shadow-blue-900/20">
              <CardHeader>
                <CardTitle className="text-white dark:text-white light:text-white">How to Play</CardTitle>
                <CardDescription className="text-gray-300 dark:text-gray-300 light:text-blue-200">
                  Game rules and scoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-left text-white dark:text-white light:text-white">
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
                    className="w-full border-white/50 bg-white text-[#00205B] hover:bg-gray-200 dark:border-white/50 dark:bg-white dark:text-black dark:hover:bg-gray-200 light:border-[#00205B] light:border-2 light:bg-white light:text-[#00205B] light:hover:bg-gray-200 font-medium"
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
  )
}

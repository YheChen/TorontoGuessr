import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, MapPin } from "lucide-react"
import Header from "@/components/Header"

export default function About() {
  return (
    <main className="min-h-screen bg-background text-foreground dark:bg-gray-900 light:bg-gray-100">
      <Header />
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <Link href="/">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </Link>
        </div>

        <div className="flex items-center gap-2 mb-6">
          <MapPin className="h-8 w-8 text-[#CF142B]" />
          <h1 className="text-3xl font-bold dark:text-white light:text-[#00205B]">About Toronto GeoGuessr</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="dark:bg-gray-800 light:bg-[#00205B] light:text-white light:border-[#001233] light:border-2">
            <CardHeader>
              <CardTitle className="light:text-white">How to Play</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                Toronto GeoGuessr is a game that tests your knowledge of Toronto's streets and neighborhoods. You'll be
                shown images from around the city with street signs blurred out, and your task is to guess where the
                photo was taken.
              </p>

              <ol className="list-decimal pl-5 space-y-2">
                <li>You'll see a Toronto street scene with signs blurred</li>
                <li>Use context clues like architecture, landmarks, and surroundings to guess the location</li>
                <li>Click on the map to place your guess</li>
                <li>Submit your guess to see how close you were</li>
                <li>Score is based on distance from actual location</li>
                <li>Complete 5 rounds to finish a game</li>
              </ol>

              <p>
                The closer your guess, the more points you'll earn. A perfect guess (within 100 meters) earns 5000
                points. Points decrease with distance, and guesses more than 10km away earn 0 points.
              </p>
            </CardContent>
          </Card>

          <Card className="dark:bg-gray-800 light:bg-[#00205B] light:text-white light:border-[#001233] light:border-2">
            <CardHeader>
              <CardTitle className="light:text-white">About the Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>This project uses several technologies to create an engaging geographic guessing game:</p>

              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Google Street View API</strong> - To collect street-level imagery from around Toronto
                </li>
                <li>
                  <strong>YOLO Object Detection</strong> - To automatically detect and blur street signs
                </li>
                <li>
                  <strong>Next.js</strong> - For the web application framework
                </li>
                <li>
                  <strong>Leaflet/Google Maps</strong> - For the interactive map interface
                </li>
                <li>
                  <strong>Haversine Formula</strong> - To calculate distances between geographic coordinates
                </li>
              </ul>

              <p className="mt-4">
                The game focuses on downtown Toronto and surrounding neighborhoods, including the Financial District,
                Entertainment District, Chinatown, Kensington Market, Queen West, Distillery District, Yorkville, and
                Harbourfront.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

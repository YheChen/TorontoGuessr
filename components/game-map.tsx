"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { MapPin, Navigation } from "lucide-react"

interface GameMapProps {
  onMapClick?: (lat: number, lng: number) => void
  guessLocation: { lat: number; lng: number } | null
  actualLocation: { lat: number; lng: number } | null
  isGuessing: boolean
}

export function GameMap({ onMapClick, guessLocation, actualLocation, isGuessing }: GameMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapImage, setMapImage] = useState("/placeholder.svg?height=400&width=600")

  // This is a placeholder for the actual map implementation
  // In a real implementation, you would use Google Maps or Leaflet.js

  useEffect(() => {
    // Simulate map loading
    const timer = setTimeout(() => {
      setMapImage("/placeholder.svg?height=400&width=600")
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current || !onMapClick || !isGuessing) return

    const rect = mapRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Convert pixel coordinates to lat/lng
    // This is a simplified example - in a real implementation you would use the map API
    const mapWidth = rect.width
    const mapHeight = rect.height

    // Toronto bounds (approximately)
    const northLat = 43.8554
    const southLat = 43.581
    const westLng = -79.639
    const eastLng = -79.1552

    const lat = northLat - (y / mapHeight) * (northLat - southLat)
    const lng = westLng + (x / mapWidth) * (eastLng - westLng)

    onMapClick(lat, lng)
  }

  return (
    <Card className="overflow-hidden dark:bg-gray-800 light:bg-white">
      <div
        ref={mapRef}
        className="relative h-[400px] w-full bg-cover bg-center cursor-crosshair"
        style={{ backgroundImage: `url(${mapImage})` }}
        onClick={handleMapClick}
      >
        {guessLocation && (
          <div
            className="absolute z-10 transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${((guessLocation.lng - -79.639) / (-79.1552 - -79.639)) * 100}%`,
              top: `${((43.8554 - guessLocation.lat) / (43.8554 - 43.581)) * 100}%`,
            }}
          >
            <MapPin size={32} className="text-red-500" />
          </div>
        )}

        {actualLocation && (
          <div
            className="absolute z-10 ransform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${((actualLocation.lng - -79.639) / (-79.1552 - -79.639)) * 100}%`,
              top: `${((43.8554 - actualLocation.lat) / (43.8554 - 43.581)) * 100}%`,
            }}
          >
            <Navigation size={32} className="text-green-500" />
          </div>
        )}

        {guessLocation && actualLocation && (
          <div className="absolute inset-0 z-0">
            <svg className="w-full h-full">
              <line
                x1={`${((guessLocation.lng - -79.639) / (-79.1552 - -79.639)) * 100}%`}
                y1={`${((43.8554 - guessLocation.lat) / (43.8554 - 43.581)) * 100}%`}
                x2={`${((actualLocation.lng - -79.639) / (-79.1552 - -79.639)) * 100}%`}
                y2={`${((43.8554 - actualLocation.lat) / (43.8554 - 43.581)) * 100}%`}
                stroke="#000"
                strokeWidth="2"
                strokeDasharray="5,5"
              />
            </svg>
          </div>
        )}

        <div className="absolute bottom-2 right-2 bg-white/80 dark:bg-black/80 light:bg-white/80 px-2 py-1 text-xs rounded dark:text-white light:text-gray-900">
          {isGuessing ? "Click to place your guess" : "Guess vs Actual Location"}
        </div>
      </div>
    </Card>
  )
}

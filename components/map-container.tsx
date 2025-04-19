"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"

export function MapContainer() {
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Simulate map loading
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="relative flex-1 min-h-[400px] bg-gray-100">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#00205B]" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-[url('/placeholder.svg?height=800&width=1200')] bg-cover bg-center">
          {/* Map will be initialized here with actual map library */}
          <div className="absolute bottom-4 right-4">
            <Button variant="outline" className="bg-white">
              Toggle Street View
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

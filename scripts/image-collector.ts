/**
 * This script demonstrates how to collect Street View images for the game
 * In a real implementation, you would need to:
 * 1. Set up Google Street View Static API credentials
 * 2. Define the bounds for downtown Toronto
 * 3. Generate random points within those bounds
 * 4. Check if Street View is available at those points
 * 5. Download and save the images
 */

// Toronto downtown bounds (approximate)
const TORONTO_BOUNDS = {
  north: 43.6772,
  south: 43.63,
  east: -79.35,
  west: -79.41,
}

// Neighborhoods to ensure coverage
const TORONTO_NEIGHBORHOODS = [
  { name: "Financial District", lat: 43.6486, lng: -79.379 },
  { name: "Entertainment District", lat: 43.647, lng: -79.3882 },
  { name: "Chinatown", lat: 43.6532, lng: -79.3972 },
  { name: "Kensington Market", lat: 43.6543, lng: -79.4007 },
  { name: "Queen West", lat: 43.6472, lng: -79.4015 },
  { name: "Distillery District", lat: 43.6503, lng: -79.3596 },
  { name: "Yorkville", lat: 43.6708, lng: -79.3928 },
  { name: "Harbourfront", lat: 43.6389, lng: -79.3781 },
]

/**
 * Generate a random point within the Toronto bounds
 */
function generateRandomPoint() {
  const lat = Math.random() * (TORONTO_BOUNDS.north - TORONTO_BOUNDS.south) + TORONTO_BOUNDS.south
  const lng = Math.random() * (TORONTO_BOUNDS.east - TORONTO_BOUNDS.west) + TORONTO_BOUNDS.west
  return { lat, lng }
}

/**
 * Generate a Street View image URL for a given location
 * @param lat Latitude
 * @param lng Longitude
 * @param apiKey Google API Key
 * @returns URL for the Street View image
 */
function generateStreetViewUrl(lat: number, lng: number, apiKey: string) {
  return `https://maps.googleapis.com/maps/api/streetview?size=600x400&location=${lat},${lng}&fov=90&heading=270&pitch=0&key=${apiKey}`
}

/**
 * Check if Street View is available at a given location
 * @param lat Latitude
 * @param lng Longitude
 * @param apiKey Google API Key
 * @returns Promise that resolves to true if Street View is available
 */
async function checkStreetViewAvailability(lat: number, lng: number, apiKey: string): Promise<boolean> {
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()
    return data.status === "OK"
  } catch (error) {
    console.error("Error checking Street View availability:", error)
    return false
  }
}

/**
 * Main function to collect Street View images
 * @param count Number of images to collect
 * @param apiKey Google API Key
 */
async function collectStreetViewImages(count: number, apiKey: string) {
  const locations = []

  console.log(`Collecting ${count} Street View images for Toronto...`)

  // First, collect images from specific neighborhoods
  for (const neighborhood of TORONTO_NEIGHBORHOODS) {
    console.log(`Checking ${neighborhood.name}...`)

    // Add some randomness to the exact location
    const lat = neighborhood.lat + (Math.random() - 0.5) * 0.005
    const lng = neighborhood.lng + (Math.random() - 0.5) * 0.005

    const hasStreetView = await checkStreetViewAvailability(lat, lng, apiKey)

    if (hasStreetView) {
      locations.push({
        lat,
        lng,
        name: neighborhood.name,
        url: generateStreetViewUrl(lat, lng, apiKey),
      })

      console.log(`Added ${neighborhood.name}`)
    }
  }

  // Then, collect random images until we reach the desired count
  while (locations.length < count) {
    const point = generateRandomPoint()

    const hasStreetView = await checkStreetViewAvailability(point.lat, point.lng, apiKey)

    if (hasStreetView) {
      // Determine which neighborhood this point is in (or closest to)
      let closestNeighborhood = TORONTO_NEIGHBORHOODS[0]
      let minDistance = calculateDistance(point.lat, point.lng, closestNeighborhood.lat, closestNeighborhood.lng)

      for (const neighborhood of TORONTO_NEIGHBORHOODS) {
        const distance = calculateDistance(point.lat, point.lng, neighborhood.lat, neighborhood.lng)

        if (distance < minDistance) {
          minDistance = distance
          closestNeighborhood = neighborhood
        }
      }

      locations.push({
        lat: point.lat,
        lng: point.lng,
        name: `Near ${closestNeighborhood.name}`,
        url: generateStreetViewUrl(point.lat, point.lng, apiKey),
      })

      console.log(`Added random location near ${closestNeighborhood.name}`)
    }
  }

  console.log(`Collected ${locations.length} Street View images`)
  return locations
}

/**
 * Calculate distance between two points (simplified version)
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Example usage:
// Replace 'YOUR_API_KEY' with an actual Google API key
// collectStreetViewImages(50, 'YOUR_API_KEY').then(locations => {
//   console.log(`Collected ${locations.length} locations`);
//   // Save locations to a JSON file or database
// });

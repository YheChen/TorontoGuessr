"use client";

import {
  useJsApiLoader,
  GoogleMap,
  MarkerF,
  PolylineF,
} from "@react-google-maps/api";
import { Card } from "@/components/ui/card";

interface GameMapProps {
  onMapClick?: (lat: number, lng: number) => void;
  guessLocation: { lat: number; lng: number } | null;
  actualLocation: { lat: number; lng: number } | null;
  isGuessing: boolean;
}

const containerStyle = {
  width: "100%",
  height: "400px",
};

const centerToronto = {
  lat: 43.6532,
  lng: -79.3832,
};

export function GameMap({
  onMapClick,
  guessLocation,
  actualLocation,
  isGuessing,
}: GameMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  if (!isLoaded) {
    return <div className="text-white bg-black p-4">Loading map...</div>;
  }

  return (
    <Card className="overflow-hidden dark:bg-gray-800 light:bg-white">
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={centerToronto}
        zoom={12}
        onClick={(e) => {
          if (isGuessing && onMapClick && e.latLng) {
            onMapClick(e.latLng.lat(), e.latLng.lng());
          }
        }}
        options={{
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
        }}
      >
        {guessLocation && (
          <MarkerF
            position={guessLocation}
            icon={{
              url: "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
            }}
          />
        )}
        {actualLocation && (
          <MarkerF
            position={actualLocation}
            icon={{
              url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
            }}
          />
        )}
        {guessLocation && actualLocation && (
          <PolylineF
            path={[guessLocation, actualLocation]}
            options={{
              strokeColor: "#000",
              strokeOpacity: 0.6,
              strokeWeight: 2,
              icons: [
                {
                  icon: { path: "M 0,-1 0,1", strokeOpacity: 1 },
                  offset: "0",
                  repeat: "10px",
                },
              ],
            }}
          />
        )}
      </GoogleMap>
    </Card>
  );
}

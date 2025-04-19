"use client";

import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

interface Props {
  lat: number;
  lng: number;
  testMode?: boolean; // NEW: optional prop to lock to a fixed lat/lng
}

export default function GamePanorama({ lat, lng, testMode = false }: Props) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });

  const streetViewRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (isLoaded && streetViewRef.current) {
      setLoaded(false);

      timeout = setTimeout(() => {
        const panorama = new google.maps.StreetViewPanorama(
          streetViewRef.current!,
          {
            position: testMode
              ? { lat: 42.345573, lng: -71.098326 } // ✅ fixed location: Downtown Toronto
              : { lat, lng },
            pov: {
              heading: Math.random() * 360,
              pitch: 0,
            },
            zoom: 1,
            disableDefaultUI: true,
            showRoadLabels: false,
          }
        );
        setLoaded(true);
      }, 1000); // ✅ throttle load (1 second delay)
    }

    return () => clearTimeout(timeout);
  }, [isLoaded, lat, lng, testMode]);

  if (!isLoaded) {
    return (
      <div className="text-white bg-black p-4">Loading Google Maps...</div>
    );
  }

  return (
    <div style={{ height: "600px", width: "100%", position: "relative" }}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white z-10">
          Loading Street View...
        </div>
      )}
      <div ref={streetViewRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

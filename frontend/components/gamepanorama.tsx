"use client";

import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

interface Props {
  panoId: string;
  heading: number;
  pitch?: number;
  zoom?: number;
}

export default function GamePanorama({
  panoId,
  heading,
  pitch = 0,
  zoom = 1,
}: Props) {
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
        new google.maps.StreetViewPanorama(streetViewRef.current!, {
          pano: panoId,
          pov: {
            heading,
            pitch,
          },
          zoom,
          disableDefaultUI: true,
          showRoadLabels: false,
        });
        setLoaded(true);
      }, 1000);
    }

    return () => clearTimeout(timeout);
  }, [heading, isLoaded, panoId, pitch, zoom]);

  if (!isLoaded) {
    return <div className="bg-black p-4 text-white">Loading Google Maps...</div>;
  }

  return (
    <div style={{ height: "600px", width: "100%", position: "relative" }}>
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white">
          Loading Street View...
        </div>
      )}
      <div ref={streetViewRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { Card } from "@/components/ui/card";

interface ReviewLocationMapProps {
  location: {
    lat: number;
    lng: number;
  };
}

const containerStyle = {
  width: "100%",
  height: "360px",
};

export function ReviewLocationMap({ location }: ReviewLocationMapProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded || !mapRef.current) {
      return;
    }

    const map = new google.maps.Map(mapRef.current, {
      center: location,
      zoom: 15,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: "greedy",
    });

    const marker = new google.maps.Marker({
      position: location,
      map,
    });

    return () => {
      marker.setMap(null);
      if (mapRef.current) {
        mapRef.current.innerHTML = "";
      }
    };
  }, [isLoaded, location.lat, location.lng]);

  if (loadError) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/90 p-4 text-sm text-muted-foreground shadow-md dark:border-transparent dark:bg-black dark:text-white">
        Google Maps failed to load for the review map.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="rounded-lg border border-border/70 bg-card/90 p-4 text-sm text-muted-foreground shadow-md dark:border-transparent dark:bg-black dark:text-white">
        Loading map...
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-border/70 bg-card/95 shadow-md dark:bg-gray-800">
      <div ref={mapRef} style={containerStyle} />
    </Card>
  );
}

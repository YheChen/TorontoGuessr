"use client";

import { useEffect, useRef } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { MapPinOff } from "lucide-react";
import { Spinner } from "@/components/site/spinner";

interface ReviewLocationMapProps {
  location: {
    lat: number;
    lng: number;
  };
}

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
      <div className="flex h-[300px] flex-col items-center justify-center gap-3 rounded-2xl bg-muted/40 p-6 text-center text-sm text-muted-foreground ring-1 ring-border/60">
        <MapPinOff className="size-6" />
        Google Maps failed to load for the review map.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl bg-muted/40 ring-1 ring-border/60">
        <Spinner size={26} />
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full overflow-hidden rounded-2xl ring-1 ring-border/60">
      <div ref={mapRef} className="h-full w-full" />
    </div>
  );
}

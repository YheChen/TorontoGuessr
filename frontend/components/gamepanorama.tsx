"use client";

import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { Spinner } from "@/components/site/spinner";

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
    if (!isLoaded || !streetViewRef.current) {
      return;
    }

    setLoaded(false);
    const node = streetViewRef.current;
    node.innerHTML = "";

    const panorama = new google.maps.StreetViewPanorama(node, {
      pano: panoId,
      pov: { heading, pitch },
      zoom,
      disableDefaultUI: true,
      showRoadLabels: false,
      // Don't rotate the view with the phone's gyroscope on mobile.
      motionTracking: false,
      motionTrackingControl: false,
    });

    // Hide the overlay as soon as the panorama reports it has imagery, rather
    // than after an arbitrary delay. A fallback guarantees it never sticks.
    const listener = panorama.addListener("pano_changed", () =>
      setLoaded(true),
    );
    const fallback = setTimeout(() => setLoaded(true), 1200);

    return () => {
      listener.remove();
      clearTimeout(fallback);
      node.innerHTML = "";
    };
  }, [heading, isLoaded, panoId, pitch, zoom]);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl bg-black ring-1 ring-border/60">
      {(!isLoaded || !loaded) && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/70 text-white backdrop-blur-sm">
          <Spinner size={32} />
          <p className="text-sm font-medium text-white/80">
            {isLoaded ? "Loading Street View…" : "Loading Google Maps…"}
          </p>
        </div>
      )}
      <div ref={streetViewRef} className="h-full w-full" />
    </div>
  );
}

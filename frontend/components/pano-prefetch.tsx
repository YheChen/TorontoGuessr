"use client";

import { useEffect, useRef } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

/**
 * Invisible Street View instance that warms the next round's panorama tiles
 * while the player reads their result, so the next round appears instantly.
 */
export function PanoPrefetch({ panoId }: { panoId: string }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isLoaded || !containerRef.current) {
      return;
    }

    const node = containerRef.current;
    new google.maps.StreetViewPanorama(node, {
      pano: panoId,
      pov: { heading: 0, pitch: 0 },
      zoom: 1,
      disableDefaultUI: true,
      showRoadLabels: false,
      motionTracking: false,
      motionTrackingControl: false,
    });

    return () => {
      node.innerHTML = "";
    };
  }, [isLoaded, panoId]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none fixed left-[-9999px] top-0 h-64 w-64"
    />
  );
}

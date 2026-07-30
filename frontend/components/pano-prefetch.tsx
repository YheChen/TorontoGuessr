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
    // Two elements on purpose. Google Maps writes inline styles onto whatever
    // node it is handed, and one of them is `position: relative`, which
    // outranks a positioning class and drops the node back into normal flow.
    // When that happened here, this 256px prefetch surface became 256px of
    // blank space above the round results on every round that had a next round
    // to warm. Keeping the positioning on an outer wrapper that Maps never
    // touches makes that impossible, and matches what GamePanorama already
    // does.
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-[-9999px] top-0 h-64 w-64"
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

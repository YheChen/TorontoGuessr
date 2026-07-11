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

  const containerRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const currentPanoRef = useRef<string | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Hide the overlay when imagery reports in; the fallback guarantees it
  // never sticks if the event is missed.
  const armLoadingFallback = () => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
    }
    fallbackRef.current = setTimeout(() => setLoaded(true), 1200);
  };

  // Create the panorama once per mount; later rounds reuse the instance via
  // setPano instead of paying construction cost again. The initial pov props
  // are read from the closure on purpose.
  useEffect(() => {
    if (!isLoaded || !containerRef.current) {
      return;
    }

    const node = containerRef.current;
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
    panoramaRef.current = panorama;
    currentPanoRef.current = panoId;
    const listener = panorama.addListener("pano_changed", () =>
      setLoaded(true),
    );
    armLoadingFallback();

    return () => {
      listener.remove();
      if (fallbackRef.current) {
        clearTimeout(fallbackRef.current);
      }
      panoramaRef.current = null;
      currentPanoRef.current = null;
      node.innerHTML = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  // Round changes: retarget the existing instance.
  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!panorama) {
      return;
    }

    if (currentPanoRef.current !== panoId) {
      currentPanoRef.current = panoId;
      setLoaded(false);
      armLoadingFallback();
      panorama.setPano(panoId);
    }
    panorama.setPov({ heading, pitch });
    panorama.setZoom(zoom);
  }, [panoId, heading, pitch, zoom]);

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
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

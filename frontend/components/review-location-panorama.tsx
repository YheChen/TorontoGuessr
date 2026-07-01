"use client";

import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";
import { ImageOff } from "lucide-react";
import { Spinner } from "@/components/site/spinner";

interface ReviewLocationPanoramaProps {
  location: {
    lat: number;
    lng: number;
  };
  panoId: string | null;
}

export function ReviewLocationPanorama({
  location,
  panoId,
}: ReviewLocationPanoramaProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });
  const streetViewRef = useRef<HTMLDivElement>(null);
  const [isPanoramaReady, setIsPanoramaReady] = useState(false);
  const [panoramaError, setPanoramaError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded || !streetViewRef.current) {
      return;
    }

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    setIsPanoramaReady(false);
    setPanoramaError(null);
    streetViewRef.current.innerHTML = "";

    timeoutId = setTimeout(() => {
      if (isCancelled || !streetViewRef.current) {
        return;
      }

      const panorama = new google.maps.StreetViewPanorama(streetViewRef.current, {
        disableDefaultUI: true,
        showRoadLabels: false,
        motionTracking: false,
        motionTrackingControl: false,
        pov: {
          heading: 0,
          pitch: 0,
        },
        zoom: 1,
        visible: true,
      });
      const streetViewService = new google.maps.StreetViewService();

      const applyPanorama = (resolvedPanoId: string) => {
        if (isCancelled) {
          return;
        }

        panorama.setPano(resolvedPanoId);
        panorama.setPov({
          heading: 0,
          pitch: 0,
        });
        panorama.setZoom(1);
        panorama.setVisible(true);
        google.maps.event.trigger(panorama, "resize");
        setIsPanoramaReady(true);
      };

      const failPanorama = (message: string) => {
        if (isCancelled) {
          return;
        }

        setPanoramaError(message);
      };

      const loadByLocation = () => {
        streetViewService.getPanorama(
          {
            location,
            radius: 50,
          },
          (result, status) => {
            if (
              status === google.maps.StreetViewStatus.OK &&
              result?.location?.pano
            ) {
              applyPanorama(result.location.pano);
              return;
            }

            failPanorama(
              "No Street View panorama could be found near these coordinates."
            );
          }
        );
      };

      if (panoId) {
        streetViewService.getPanorama({ pano: panoId }, (result, status) => {
          if (
            status === google.maps.StreetViewStatus.OK &&
            result?.location?.pano
          ) {
            applyPanorama(result.location.pano);
            return;
          }

          loadByLocation();
        });
      } else {
        loadByLocation();
      }
    }, 200);

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (streetViewRef.current) {
        streetViewRef.current.innerHTML = "";
      }
    };
  }, [isLoaded, location.lat, location.lng, panoId]);

  if (loadError) {
    return (
      <div className="flex h-[58vh] min-h-[420px] flex-col items-center justify-center gap-3 rounded-2xl bg-black/85 p-6 text-center text-white ring-1 ring-border/60">
        <ImageOff className="size-8 text-white/70" />
        <p className="max-w-sm text-sm text-white/80">
          Google Maps failed to load for Street View. Check the browser console
          and API key restrictions.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[58vh] min-h-[420px] items-center justify-center rounded-2xl bg-black p-4 text-white ring-1 ring-border/60">
        <Spinner size={30} />
      </div>
    );
  }

  return (
    <div className="relative h-[58vh] min-h-[420px] w-full overflow-hidden rounded-2xl bg-black ring-1 ring-border/60">
      {!isPanoramaReady && !panoramaError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/65 text-white backdrop-blur-sm">
          <Spinner size={30} />
          <p className="text-sm text-white/80">Loading Street View…</p>
        </div>
      )}
      {panoramaError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/85 p-6 text-center text-white">
          <ImageOff className="size-8 text-white/70" />
          <p className="max-w-sm text-sm text-white/85">{panoramaError}</p>
        </div>
      )}
      <div ref={streetViewRef} className="h-full w-full" />
    </div>
  );
}

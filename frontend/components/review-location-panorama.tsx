"use client";

import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

interface ReviewLocationPanoramaProps {
  location: {
    lat: number;
    lng: number;
  };
  panoId: string | null;
}

const containerStyle = {
  height: "600px",
  width: "100%",
  position: "relative" as const,
};

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
      <div className="flex h-[600px] items-center justify-center rounded-lg bg-black/80 p-6 text-center text-white">
        Google Maps failed to load for Street View. Check the browser console and
        API key restrictions.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-[600px] items-center justify-center rounded-lg bg-black p-4 text-white">
        Loading Google Maps...
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {!isPanoramaReady && !panoramaError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-white">
          Loading Street View...
        </div>
      )}
      {panoramaError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/80 p-6 text-center text-white">
          {panoramaError}
        </div>
      )}
      <div ref={streetViewRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

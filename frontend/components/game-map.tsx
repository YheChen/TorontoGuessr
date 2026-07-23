"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useJsApiLoader,
  GoogleMap,
  MarkerF,
  PolylineF,
} from "@react-google-maps/api";
import { Sun, Moon } from "lucide-react";
import { Spinner } from "@/components/site/spinner";
import { useMapTheme } from "@/components/site/map-theme";

interface LatLng {
  lat: number;
  lng: number;
}

interface GameMapProps {
  onMapClick?: (lat: number, lng: number) => void;
  guessLocation: LatLng | null;
  actualLocation: LatLng | null;
  isGuessing: boolean;
  className?: string;
  /**
   * Changes once per new guessing round. When the same map instance is reused
   * across guessing and results (rather than remounted), a change here returns
   * the view to the Toronto overview so the next round does not start framed on
   * the previous round's result.
   */
  viewResetKey?: string | number;
}

const centerToronto: LatLng = { lat: 43.6532, lng: -79.3832 };

function pinDataUri(fill: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C7 0 .5 6.4.5 14.3.5 24.6 15 40 15 40s14.5-15.4 14.5-25.7C29.5 6.4 23 0 15 0Z" fill="${fill}"/><circle cx="15" cy="14.3" r="5.4" fill="#fff"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

// Hex values chosen to track the --toronto-red / --success tokens per theme so
// the on-map pins match the legend swatches in the results UI.
const GUESS_PIN_HEX = { light: "#cf1732", dark: "#ee3a55" };
const ACTUAL_PIN_HEX = { light: "#1f9e63", dark: "#31b97a" };

// Minimal, de-cluttered map styles so the guess map reads as a clean UI
// surface rather than a busy reference map.
const MAP_STYLE_LIGHT: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

const MAP_STYLE_DARK: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0f1626" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8aa0c0" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1120" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1a2f" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2740" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a3550" }] },
];

export function GameMap({
  onMapClick,
  guessLocation,
  actualLocation,
  isGuessing,
  className,
  viewResetKey,
}: GameMapProps) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!,
  });
  const { mapTheme, toggle: toggleMapTheme } = useMapTheme();
  const mapRef = useRef<google.maps.Map | null>(null);
  const isDark = mapTheme === "dark";

  const guessPin = useMemo(
    () => pinDataUri(isDark ? GUESS_PIN_HEX.dark : GUESS_PIN_HEX.light),
    [isDark],
  );
  const actualPin = useMemo(
    () => pinDataUri(isDark ? ACTUAL_PIN_HEX.dark : ACTUAL_PIN_HEX.light),
    [isDark],
  );

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);
  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // When showing results, frame both markers; otherwise rest on Toronto.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isGuessing) return;

    if (guessLocation && actualLocation) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(guessLocation);
      bounds.extend(actualLocation);
      map.fitBounds(bounds, 72);
    } else if (actualLocation) {
      map.setCenter(actualLocation);
      map.setZoom(14);
    }
  }, [isGuessing, guessLocation, actualLocation]);

  // Reset to the Toronto overview at the start of each new guessing round. A
  // remount used to do this for free; a reused instance must do it explicitly.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isGuessing) return;
    map.setCenter(centerToronto);
    map.setZoom(11);
  }, [viewResetKey, isGuessing]);

  if (!isLoaded) {
    return (
      <div
        className={`flex min-h-[240px] items-center justify-center rounded-2xl border border-border/70 bg-muted/40 ${className ?? ""}`}
      >
        <Spinner size={26} />
      </div>
    );
  }

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-2xl ring-1 ring-border/70 ${className ?? ""}`}
    >
      <GoogleMap
        mapContainerStyle={{ width: "100%", height: "100%" }}
        center={centerToronto}
        zoom={11}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={(e) => {
          if (isGuessing && onMapClick && e.latLng) {
            onMapClick(e.latLng.lat(), e.latLng.lng());
          }
        }}
        options={{
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: "greedy",
          zoomControl: true,
          styles: isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT,
        }}
      >
        {guessLocation && (
          <MarkerF
            position={guessLocation}
            icon={{
              url: guessPin,
              scaledSize: new google.maps.Size(30, 40),
              anchor: new google.maps.Point(15, 40),
            }}
          />
        )}
        {actualLocation && (
          <MarkerF
            position={actualLocation}
            icon={{
              url: actualPin,
              scaledSize: new google.maps.Size(30, 40),
              anchor: new google.maps.Point(15, 40),
            }}
          />
        )}
        {guessLocation && actualLocation && (
          <PolylineF
            path={[guessLocation, actualLocation]}
            options={{
              strokeColor: isDark ? "#cbd5e1" : "#334155",
              strokeOpacity: 0,
              icons: [
                {
                  icon: {
                    path: "M 0,-1 0,1",
                    strokeOpacity: 0.9,
                    strokeWeight: 2.5,
                    scale: 3,
                  },
                  offset: "0",
                  repeat: "12px",
                },
              ],
            }}
          />
        )}
      </GoogleMap>

      <button
        type="button"
        onClick={toggleMapTheme}
        aria-label={`Switch map to ${isDark ? "light" : "dark"} appearance`}
        title={`Switch map to ${isDark ? "light" : "dark"} appearance`}
        className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-card/90 text-foreground shadow-soft ring-1 ring-border backdrop-blur transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </div>
  );
}

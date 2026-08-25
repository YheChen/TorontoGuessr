"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useJsApiLoader,
  GoogleMap,
  MarkerF,
  OverlayView,
  OverlayViewF,
  PolylineF,
} from "@react-google-maps/api";
import { Sun, Moon } from "lucide-react";
import { Spinner } from "@/components/site/spinner";
import { useMapTheme } from "@/components/site/map-theme";
import { formatDistanceCompact } from "@/lib/format-distance";
import { midpoint } from "@/lib/map-geometry";

interface LatLng {
  lat: number;
  lng: number;
}

/** One other player's pin, drawn in their scoreboard colour. */
export interface GuessPin {
  id: string;
  label: string;
  location: LatLng;
  color: string;
  /**
   * How far this pin was from the answer, in km, for the label on its line.
   * The server's number, not one recomputed here: it is what the round was
   * scored from, and a locally recomputed value could disagree with the score
   * shown beside it.
   */
  distanceKm?: number | null;
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
  /**
   * Every player's pin, for a multiplayer reveal. When set, these are drawn
   * alongside `guessLocation` and all of them are framed. Single-player passes
   * nothing and behaves exactly as before.
   */
  guessPins?: GuessPin[];
  /**
   * Distance in km for the single-player guess line, from the server's scored
   * result. Omitted while guessing, when there is no line and no answer yet.
   */
  guessDistanceKm?: number | null;
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

/** Centres an overlay on its anchor point rather than hanging it below-right. */
function centerOverlay(width: number, height: number) {
  return { x: -(width / 2), y: -(height / 2) };
}

export function GameMap({
  onMapClick,
  guessLocation,
  actualLocation,
  isGuessing,
  className,
  viewResetKey,
  guessPins,
  guessDistanceKm,
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

  const guessDistanceLabel = useMemo(
    () => formatDistanceCompact(guessDistanceKm),
    [guessDistanceKm],
  );

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);
  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Frame everything worth seeing on a reveal: the answer, your pin, and in a
  // lobby every other player's pin too. Otherwise rest on Toronto.
  const pinKey = useMemo(
    () =>
      (guessPins ?? [])
        .map((pin) => `${pin.id}:${pin.location.lat},${pin.location.lng}`)
        .join("|"),
    [guessPins],
  );
  useEffect(() => {
    const map = mapRef.current;
    if (!map || isGuessing) return;

    const points: LatLng[] = [];
    if (actualLocation) points.push(actualLocation);
    if (guessLocation) points.push(guessLocation);
    for (const pin of guessPins ?? []) points.push(pin.location);

    if (points.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      for (const point of points) bounds.extend(point);
      map.fitBounds(bounds, 72);
    } else if (points.length === 1 && points[0]) {
      map.setCenter(points[0]);
      map.setZoom(14);
    }
    // pinKey stands in for guessPins so a new array identity alone does not
    // refit the view while the player is panning around.
  }, [isGuessing, guessLocation, actualLocation, pinKey, guessPins]);

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
      data-testid="game-map"
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

        {/* How far off the guess was, written on its own line. The card beside
            the map says the same number, but reading it there means looking away
            from the two pins you are comparing. */}
        {guessLocation && actualLocation && guessDistanceLabel && (
          <OverlayViewF
            position={midpoint(guessLocation, actualLocation)}
            mapPaneName={OverlayView.FLOAT_PANE}
            getPixelPositionOffset={centerOverlay}
          >
            <span className="pointer-events-none select-none whitespace-nowrap rounded-full bg-card/95 px-2 py-0.5 text-[11px] font-semibold tabular text-foreground shadow-soft ring-1 ring-border/70 backdrop-blur-sm">
              {guessDistanceLabel}
            </span>
          </OverlayViewF>
        )}

        {/* Lobby reveal: one pin per player, each tied to the answer. */}
        {(guessPins ?? []).map((pin) => (
          <MarkerF
            key={pin.id}
            position={pin.location}
            title={pin.label}
            icon={{
              url: pinDataUri(pin.color),
              scaledSize: new google.maps.Size(26, 35),
              anchor: new google.maps.Point(13, 35),
            }}
          />
        ))}
        {actualLocation &&
          (guessPins ?? []).map((pin) => (
            <PolylineF
              key={`line-${pin.id}`}
              path={[pin.location, actualLocation]}
              options={{
                strokeColor: pin.color,
                strokeOpacity: 0.55,
                strokeWeight: 2,
              }}
            />
          ))}

        {/* One distance per player, on their own line and in their own colour,
            so a reveal can be read without cross-referencing the scoreboard.
            Several of these can sit close together when players guessed near
            each other; the midpoint placement spreads them along lines that
            radiate from the answer, which is the best available separation
            without measuring rendered label boxes. */}
        {actualLocation &&
          (guessPins ?? []).map((pin) => {
            const label = formatDistanceCompact(pin.distanceKm);
            if (!label) return null;
            return (
              <OverlayViewF
                key={`label-${pin.id}`}
                position={midpoint(pin.location, actualLocation)}
                mapPaneName={OverlayView.FLOAT_PANE}
                getPixelPositionOffset={centerOverlay}
              >
                <span
                  // The player's colour is the BORDER, not the text. Two reasons.
                  // ring-1 would have ignored an inline borderColor entirely,
                  // since Tailwind rings read --tw-ring-color. And four of the
                  // eight lobby colours (amber, green, lime, cyan at 600) fall
                  // below 4.5:1 against both card backgrounds, so colouring 11px
                  // text with them would be unreadable for some players and
                  // unreadable in dark mode for more. A 2px band gives the same
                  // association with none of that.
                  className="pointer-events-none select-none whitespace-nowrap rounded-full border-2 bg-card/95 px-2 py-0.5 text-[11px] font-semibold tabular text-foreground shadow-soft backdrop-blur-sm"
                  style={{ borderColor: pin.color }}
                  title={pin.label}
                >
                  {label}
                </span>
              </OverlayViewF>
            );
          })}
      </GoogleMap>

      <button
        type="button"
        onClick={toggleMapTheme}
        aria-label={`Switch map to ${isDark ? "light" : "dark"} appearance`}
        title={`Switch map to ${isDark ? "light" : "dark"} appearance`}
        className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-card/90 text-foreground shadow-soft ring-1 ring-border backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </button>
    </div>
  );
}

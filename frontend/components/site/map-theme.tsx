"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type MapTheme = "light" | "dark";

const STORAGE_KEY = "mapTheme";

interface MapThemeContextValue {
  /** The map's own light/dark appearance, independent of the site theme. */
  mapTheme: MapTheme;
  setMapTheme: (theme: MapTheme) => void;
  toggle: () => void;
}

const MapThemeContext = createContext<MapThemeContextValue | null>(null);

/**
 * Tracks the map appearance separately from the site theme. Defaults to a
 * light map (more legible for guessing) even when the site is in dark mode,
 * and persists the user's choice.
 */
export function MapThemeProvider({ children }: { children: ReactNode }) {
  const [mapTheme, setMapThemeState] = useState<MapTheme>("light");

  // Hydrate the stored preference after mount to avoid SSR mismatch.
  //
  // The read is guarded for the same reason the write below is: touching
  // window.localStorage THROWS SecurityError when storage is blocked, it does not
  // return null. This provider wraps the whole app from the root layout, so an
  // unguarded throw here took out every route rather than just the map toggle.
  // The hazard was already recognised on the write path and missed on the read.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage blocked (private mode, cookies disabled). Keep the default.
    }
    if (stored === "light" || stored === "dark") {
      setMapThemeState(stored);
    }
  }, []);

  const setMapTheme = (next: MapTheme) => {
    setMapThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures (private mode, etc.).
    }
  };

  const toggle = () => setMapTheme(mapTheme === "dark" ? "light" : "dark");

  return (
    <MapThemeContext.Provider value={{ mapTheme, setMapTheme, toggle }}>
      {children}
    </MapThemeContext.Provider>
  );
}

export function useMapTheme(): MapThemeContextValue {
  const ctx = useContext(MapThemeContext);
  if (!ctx) {
    // Safe fallback if a map ever renders outside the provider.
    return { mapTheme: "light", setMapTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}

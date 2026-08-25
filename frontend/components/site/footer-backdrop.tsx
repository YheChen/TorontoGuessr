import { Skyline } from "@/components/site/skyline";

/**
 * Public path to custom footer artwork, or null to use the vector skyline.
 *
 * Naming a file here is the switch. To use your own artwork, drop it in
 * frontend/public (PNG with transparency, or SVG) and set this to its path.
 *
 * This used to be hardcoded to "/toronto-skyline.png" and probed for on mount
 * with new Image(), falling back to the vector when the request failed. The
 * fallback worked, so the footer always looked right, but the file was never
 * added: every visitor on every page load fetched a missing asset, took a 404,
 * and logged a console error, all to support artwork nobody had supplied. A
 * constant costs nothing and cannot 404.
 */
const SKYLINE_SRC: string | null = null;

// Fade the top of the artwork so footer text stays readable above it.
const FADE_MASK = "linear-gradient(to top, black 45%, transparent)";

export function FooterBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 overflow-hidden"
    >
      {SKYLINE_SRC ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={SKYLINE_SRC}
          alt=""
          style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
          className="h-auto w-full select-none object-cover object-bottom opacity-20 dark:opacity-25"
        />
      ) : (
        <div className="text-toronto-navy/[0.07] dark:text-white/6">
          <Skyline className="h-40 w-full sm:h-48" />
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Skyline } from "@/components/site/skyline";

/**
 * Drop a Toronto skyline image at this public path to use it as the footer
 * background. PNG (transparent) or SVG both work, just match this filename.
 */
const SKYLINE_SRC = "/toronto-skyline.png";

// Fade the top of the artwork so footer text stays readable above it.
const FADE_MASK = "linear-gradient(to top, black 45%, transparent)";

export function FooterBackdrop() {
  // Default to the vector skyline; swap in the custom image only once it has
  // verifiably loaded, so a missing file never flashes a broken-image icon.
  const [hasImage, setHasImage] = useState(false);

  useEffect(() => {
    const probe = new window.Image();
    probe.onload = () => setHasImage(true);
    probe.onerror = () => setHasImage(false);
    probe.src = SKYLINE_SRC;
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-0 z-0 overflow-hidden"
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={SKYLINE_SRC}
          alt=""
          style={{ maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }}
          className="h-auto w-full select-none object-cover object-bottom opacity-20 dark:opacity-25"
        />
      ) : (
        <div className="text-toronto-navy/[0.07] dark:text-white/[0.06]">
          <Skyline className="h-40 w-full sm:h-48" />
        </div>
      )}
    </div>
  );
}

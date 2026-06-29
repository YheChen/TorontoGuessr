"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  /** Duration of the animation in milliseconds. */
  duration?: number;
  className?: string;
  /** Number of decimal places to render. */
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Group thousands with locale separators. */
  groupSeparator?: boolean;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const easeOutExpo = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Animates a number from 0 up to `value`. Honors reduced-motion by snapping to
 * the final value. Used for score reveals and stat tiles.
 */
export function CountUp({
  value,
  duration = 1100,
  className,
  decimals = 0,
  prefix = "",
  suffix = "",
  groupSeparator = true,
}: CountUpProps) {
  const [display, setDisplay] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      return;
    }

    let start: number | null = null;
    const animate = (timestamp: number) => {
      if (start === null) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      setDisplay(value * easeOutExpo(progress));
      if (progress < 1) {
        frame.current = requestAnimationFrame(animate);
      } else {
        setDisplay(value);
      }
    };

    frame.current = requestAnimationFrame(animate);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration]);

  const formatted = display.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: groupSeparator,
  });

  return (
    <span className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

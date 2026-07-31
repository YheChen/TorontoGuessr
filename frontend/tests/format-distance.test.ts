import { describe, expect, it } from "vitest";
import {
  formatDistance,
  formatDistanceCompact,
} from "@/lib/format-distance";

describe("formatDistance", () => {
  it("uses metres below a kilometre", () => {
    expect(formatDistance(0.82)).toBe("820 m");
    expect(formatDistance(0.05)).toBe("50 m");
    expect(formatDistance(0)).toBe("0 m");
  });

  it("uses two decimals of a kilometre from 1km up", () => {
    expect(formatDistance(1)).toBe("1.00 km");
    expect(formatDistance(1.416)).toBe("1.42 km");
    expect(formatDistance(12.5)).toBe("12.50 km");
  });

  it("switches unit at exactly 1km, not near it", () => {
    // 0.9995 rounds to 1000 m rather than jumping to 1.00 km, which would read
    // as a different measurement than the one either side of it.
    expect(formatDistance(0.9994)).toBe("999 m");
    expect(formatDistance(0.99999)).toBe("1000 m");
    expect(formatDistance(1.0001)).toBe("1.00 km");
  });

  it("states an absent guess rather than showing a number", () => {
    // A timeout or a late guess stores no distance. "0 m" would read as a
    // perfect guess, which is the opposite of what happened.
    expect(formatDistance(null)).toBe("No guess");
    expect(formatDistance(undefined)).toBe("No guess");
  });

  it("treats broken input as an absent guess", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      expect(formatDistance(value)).toBe("No guess");
    }
  });
});

describe("formatDistanceCompact", () => {
  it("uses one decimal, to keep map labels narrow", () => {
    expect(formatDistanceCompact(1.416)).toBe("1.4 km");
    expect(formatDistanceCompact(12.55)).toBe("12.6 km");
  });

  it("keeps whole metres below a kilometre", () => {
    expect(formatDistanceCompact(0.82)).toBe("820 m");
    expect(formatDistanceCompact(0.004)).toBe("4 m");
  });

  it("returns null when there is nothing to label", () => {
    // Null, not "No guess": the caller draws no line without a distance, so
    // there is no line for a label to sit on. A string would put a floating
    // "No guess" pill on the map attached to nothing.
    expect(formatDistanceCompact(null)).toBeNull();
    expect(formatDistanceCompact(undefined)).toBeNull();
    expect(formatDistanceCompact(Number.NaN)).toBeNull();
  });

  it("never disagrees with the long form about the unit", () => {
    // Both switch at the same threshold. Two formatters that disagree would show
    // "980 m" on the map and "0.98 km" on the card for one guess.
    for (const km of [0.001, 0.5, 0.999, 1, 1.5, 9.99, 40]) {
      const long = formatDistance(km);
      const compact = formatDistanceCompact(km);
      expect(compact).not.toBeNull();
      expect(long.endsWith("km")).toBe(compact!.endsWith("km"));
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  calculateDistance,
  calculateScore,
} from "../src/scoring-service.js";

describe("calculateDistance", () => {
  it("returns 0 for identical points", () => {
    expect(calculateDistance(43.6532, -79.3832, 43.6532, -79.3832)).toBe(0);
  });

  it("is symmetric", () => {
    const a = calculateDistance(43.6532, -79.3832, 43.6426, -79.3871);
    const b = calculateDistance(43.6426, -79.3871, 43.6532, -79.3832);
    expect(a).toBeCloseTo(b, 10);
  });

  it("measures one degree of latitude as ~111.19 km", () => {
    expect(calculateDistance(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
  });

  it("measures a known downtown Toronto pair plausibly", () => {
    // CN Tower to Union Station is roughly 500-700 m.
    const km = calculateDistance(43.6426, -79.3871, 43.6453, -79.3806);
    expect(km).toBeGreaterThan(0.4);
    expect(km).toBeLessThan(0.8);
  });
});

describe("calculateScore", () => {
  it("awards the maximum 5000 within 100 m", () => {
    expect(calculateScore(0)).toBe(5000);
    expect(calculateScore(0.1)).toBe(5000);
  });

  it("awards 0 at 2 km or beyond", () => {
    expect(calculateScore(2)).toBe(0);
    expect(calculateScore(25)).toBe(0);
  });

  it("awards half the points at the midpoint of the decay range", () => {
    // Decay is linear from 0.1 km (5000) to 2 km (0); midpoint is 1.05 km.
    expect(calculateScore(1.05)).toBe(2500);
  });

  it("is monotonically non-increasing with distance", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let km = 0; km <= 2.2; km += 0.05) {
      const score = calculateScore(km);
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });
});

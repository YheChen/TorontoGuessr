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

  it("halves the score at one kilometre past the plateau", () => {
    // The defining constant: 1.1 km is roughly the radius of an average Toronto
    // neighbourhood, so "right neighbourhood" and "about half marks" coincide.
    expect(calculateScore(1.1)).toBe(2500);
  });

  /**
   * These are the reference vectors. The same table is asserted inside
   * add_submit_guess_function.sql, which carries a duplicate of this formula in
   * PL/pgSQL. If you change the curve, change both and keep these in step, or the
   * two scoring paths will silently disagree.
   */
  const REFERENCE_VECTORS: Array<[km: number, score: number]> = [
    [0, 5000],
    [0.05, 5000],
    [0.1, 5000],
    [0.25, 4890],
    [0.5, 4310],
    [1, 2762],
    [1.1, 2500],
    [2, 1085],
    [2.1, 1000],
    [3, 531],
    [5, 200],
    [10, 50],
    [20, 13],
    [40, 3],
  ];

  it.each(REFERENCE_VECTORS)("scores %s km as %s", (km, expected) => {
    expect(calculateScore(km)).toBe(expected);
  });

  it("no longer zeroes out a correct-neighbourhood guess", () => {
    // The bug this curve replaced: the old ramp paid 0 from 2 km outwards, so
    // recognising the right neighbourhood and missing by 2.1 km scored the same
    // as guessing another continent.
    expect(calculateScore(2.1)).toBeGreaterThan(0);
    expect(calculateScore(2.1)).toBeGreaterThan(calculateScore(20));
  });

  it("separates informed guesses from uninformed ones", () => {
    // The target set spans ~4.8 by 5.1 km, so an uninformed click averages about
    // 2.6 km out. A neighbourhood-level guess must clearly beat that.
    const neighbourhood = calculateScore(1);
    const uninformed = calculateScore(2.6);
    const wild = calculateScore(20);
    expect(neighbourhood).toBeGreaterThan(uninformed * 3);
    expect(uninformed).toBeGreaterThan(wild * 10);
  });

  it("stays inside the score range and returns whole numbers", () => {
    for (let km = 0; km <= 200; km += 0.13) {
      const score = calculateScore(km);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(5000);
    }
  });

  it("decays to nothing at absurd distances without a cliff", () => {
    // No cutoff constant is needed: the tail rounds to zero on its own. The
    // guess map is unrestricted, so a misclick really can land on another
    // continent.
    expect(calculateScore(200)).toBe(0);
    expect(calculateScore(20015)).toBe(0);
  });

  it("is monotonically non-increasing with distance", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (let km = 0; km <= 60; km += 0.05) {
      const score = calculateScore(km);
      expect(score).toBeLessThanOrEqual(previous);
      previous = score;
    }
  });

  it("fails closed on broken input rather than awarding a perfect round", () => {
    // A negative distance reaching the plateau branch would pay 5000.
    expect(calculateScore(-1)).toBe(0);
    expect(calculateScore(Number.NaN)).toBe(0);
    expect(calculateScore(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

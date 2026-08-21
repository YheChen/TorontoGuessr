import { describe, expect, it } from "vitest";
import { clampStatsDays, MAX_STATS_DAYS } from "../src/game-store.js";

/**
 * The stats range bound.
 *
 * daily_game_stats returns one row per day and PostgREST caps a response at 1000
 * rows, and the cap keeps the FIRST rows while the function orders by day
 * ascending. So a range past the cap does not return a shorter window, it
 * returns an older one with the newest days (the only ones carrying data) cut
 * off. Measured on production: days=1001 lost today, days=1200 answered a window
 * that ended six months earlier with every total at 0.
 *
 * These tests pin the boundary so raising it needs a deliberate edit here too.
 */
describe("MAX_STATS_DAYS", () => {
  it("is the row cap, not a round number", () => {
    expect(MAX_STATS_DAYS).toBe(1000);
  });
});

describe("clampStatsDays", () => {
  it("passes through a range the query can serve", () => {
    expect(clampStatsDays(1)).toBe(1);
    expect(clampStatsDays(30)).toBe(30);
    expect(clampStatsDays(365)).toBe(365);
  });

  it("keeps the last serveable day", () => {
    expect(clampStatsDays(MAX_STATS_DAYS)).toBe(MAX_STATS_DAYS);
  });

  it("clamps past the cap, where the window would silently be wrong", () => {
    expect(clampStatsDays(MAX_STATS_DAYS + 1)).toBe(MAX_STATS_DAYS);
    expect(clampStatsDays(1200)).toBe(MAX_STATS_DAYS);
    // The bound the API used to advertise.
    expect(clampStatsDays(3650)).toBe(MAX_STATS_DAYS);
  });

  it("refuses to produce a range below one day", () => {
    expect(clampStatsDays(0)).toBe(1);
    expect(clampStatsDays(-30)).toBe(1);
  });

  it("truncates rather than rounding, so a fraction cannot exceed the cap", () => {
    expect(clampStatsDays(30.9)).toBe(30);
    expect(clampStatsDays(MAX_STATS_DAYS + 0.9)).toBe(MAX_STATS_DAYS);
  });

  it("falls back to the default for values that are not numbers", () => {
    // NaN reaches generate_series as null and returns an empty series, which
    // renders as a chart with no axis rather than an error.
    expect(clampStatsDays(Number.NaN)).toBe(30);
    expect(clampStatsDays(Number.POSITIVE_INFINITY)).toBe(30);
  });
});

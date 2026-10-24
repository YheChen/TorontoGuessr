import { describe, expect, it } from "vitest";
import {
  computeScoreBands,
  dedupeNamedPlayers,
  isGuestName,
} from "../src/home-stats.js";

/**
 * The homepage states that the distribution covers every finished run, so the
 * property that matters is that the bands sum to the total. They are derived by
 * differencing cumulative "at least N" counts, which is the part that can go
 * quietly wrong.
 */
describe("computeScoreBands", () => {
  // Shaped like a real response: counts descend as the threshold rises.
  const cumulative = [3525, 2758, 1682, 799, 293];

  it("sums to the number of finished games", () => {
    const bands = computeScoreBands(cumulative, 3525);
    const total = bands.reduce((sum, band) => sum + band.count, 0);
    expect(total).toBe(3525);
  });

  it("differences each band against the next threshold up", () => {
    const bands = computeScoreBands(cumulative, 3525);
    expect(bands.map((band) => band.count)).toEqual([767, 1076, 883, 506, 293]);
  });

  it("carries the top band through as-is", () => {
    const bands = computeScoreBands(cumulative, 3525);
    expect(bands[bands.length - 1]?.count).toBe(293);
  });

  it("reports percentages to one decimal", () => {
    const bands = computeScoreBands(cumulative, 3525);
    expect(bands[0]?.percent).toBeCloseTo(21.8, 1);
    expect(bands[4]?.percent).toBeCloseTo(8.3, 1);
  });

  it("never reports a negative band", () => {
    // Counts taken a moment apart can disagree, so a later threshold may come
    // back higher than an earlier one. That must not render as a negative bar.
    const bands = computeScoreBands([10, 20, 5, 1, 0], 10);
    for (const band of bands) {
      expect(band.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("reports zero percent rather than dividing by zero", () => {
    const bands = computeScoreBands([0, 0, 0, 0, 0], 0);
    expect(bands.every((band) => band.percent === 0)).toBe(true);
  });

  it("tolerates a short counts array", () => {
    const bands = computeScoreBands([5], 5);
    expect(bands).toHaveLength(5);
    expect(bands[0]?.count).toBe(5);
  });
});

describe("isGuestName", () => {
  it("matches the generated guest names", () => {
    // createGuestUsername pads to four digits; older rows are unpadded.
    expect(isGuestName("Guest 7634")).toBe(true);
    expect(isGuestName("Guest 0042")).toBe(true);
    expect(isGuestName("guest 12")).toBe(true);
    expect(isGuestName("Guest7793")).toBe(true);
  });

  it("leaves chosen names alone", () => {
    expect(isGuestName("WalkingMan")).toBe(false);
    expect(isGuestName("Guestavo")).toBe(false);
    expect(isGuestName("Bay570")).toBe(false);
  });
});

describe("dedupeNamedPlayers", () => {
  it("keeps the first appearance of each name and drops guests", () => {
    const players = dedupeNamedPlayers([
      { username: "WalkingMan" },
      { username: "Guest 4494" },
      { username: "WalkingMan" },
      { username: "Tracy50" },
      { username: null },
      { username: "   " },
      { username: " Tracy50 " },
    ]);
    expect(players).toEqual(["WalkingMan", "Tracy50"]);
  });

  it("returns an empty list when every run was a guest", () => {
    expect(
      dedupeNamedPlayers([{ username: "Guest 1" }, { username: "Guest 2" }])
    ).toEqual([]);
  });
});

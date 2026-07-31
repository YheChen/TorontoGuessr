import { describe, expect, it } from "vitest";
import {
  dateKeyToUtc,
  daysBetweenKeys,
  shiftDateKey,
  torontoDateKey,
} from "../src/date-toronto.js";
import { EMPTY_STREAK, computeStreak } from "../src/streak-service.js";

describe("torontoDateKey", () => {
  it("uses the Toronto day, not the UTC one", () => {
    // 03:00 UTC on the 5th is 23:00 on the 4th in Toronto. A game finished then
    // belongs to the 4th for the player, and counting it as the 5th would break
    // a run they had kept.
    expect(torontoDateKey("2026-07-05T03:00:00Z")).toBe("2026-07-04");
    expect(torontoDateKey("2026-07-05T05:00:00Z")).toBe("2026-07-05");
  });

  it("handles both sides of a DST change", () => {
    // Toronto is UTC-5 in winter and UTC-4 in summer, so the same UTC hour maps
    // to different days depending on the date. Hardcoding an offset would put
    // one of these on the wrong day.
    expect(torontoDateKey("2026-01-05T04:30:00Z")).toBe("2026-01-04");
    expect(torontoDateKey("2026-07-05T04:30:00Z")).toBe("2026-07-05");
  });
});

describe("dateKeyToUtc", () => {
  it("rejects a day that does not exist", () => {
    // Date.UTC rolls 2026-02-30 forward into March without complaint, which
    // would shift a streak by a day rather than reporting bad input.
    expect(dateKeyToUtc("2026-02-30")).toBeNull();
    expect(dateKeyToUtc("2026-13-01")).toBeNull();
    expect(dateKeyToUtc("2026-02-28")).not.toBeNull();
  });

  it("rejects anything that is not a plain date key", () => {
    for (const value of ["", "2026-7-5", "2026-07-05T00:00:00Z", "nope"]) {
      expect(dateKeyToUtc(value)).toBeNull();
    }
  });
});

describe("daysBetweenKeys", () => {
  it("counts whole days across a DST boundary", () => {
    // 22 hours of wall clock between these, but one calendar day. Working in UTC
    // midnights is what makes this exact.
    expect(daysBetweenKeys("2026-03-07", "2026-03-08")).toBe(1);
    expect(daysBetweenKeys("2026-11-01", "2026-11-02")).toBe(1);
    expect(daysBetweenKeys("2026-03-01", "2026-04-01")).toBe(31);
  });

  it("is signed, and null on bad input", () => {
    expect(daysBetweenKeys("2026-07-05", "2026-07-04")).toBe(-1);
    expect(daysBetweenKeys("junk", "2026-07-04")).toBeNull();
  });
});

describe("shiftDateKey", () => {
  it("crosses month, year, and DST boundaries", () => {
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateKey("2026-03-09", -1)).toBe("2026-03-08");
    expect(shiftDateKey("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("computeStreak", () => {
  const today = "2026-07-31";

  it("reports nothing for an account with no finished games", () => {
    expect(computeStreak([], today)).toEqual(EMPTY_STREAK);
  });

  it("counts a run that reaches today", () => {
    expect(computeStreak(["2026-07-29", "2026-07-30", "2026-07-31"], today)).toEqual(
      { current: 3, best: 3, lastPlayedDate: "2026-07-31" }
    );
  });

  it("keeps a run alive when the last play was yesterday", () => {
    // The player has the rest of today to continue, so showing 0 would be both
    // wrong and discouraging. Matches advanceStreak in the client.
    expect(computeStreak(["2026-07-29", "2026-07-30"], today)).toMatchObject({
      current: 2,
    });
  });

  it("reports a broken run as zero while keeping the best", () => {
    expect(computeStreak(["2026-07-01", "2026-07-02", "2026-07-03"], today)).toEqual(
      { current: 0, best: 3, lastPlayedDate: "2026-07-03" }
    );
  });

  it("does not count two games on one day as two days", () => {
    // Several games a day is the normal case, and the whole point of deriving
    // from days rather than from game count.
    expect(
      computeStreak(["2026-07-31", "2026-07-31", "2026-07-30"], today)
    ).toMatchObject({ current: 2, best: 2 });
  });

  it("does not care what order the games arrive in", () => {
    const shuffled = ["2026-07-30", "2026-07-28", "2026-07-31", "2026-07-29"];
    expect(computeStreak(shuffled, today)).toMatchObject({ current: 4, best: 4 });
  });

  it("takes the best from an earlier run when the live one is shorter", () => {
    const keys = [
      "2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05",
      "2026-07-30", "2026-07-31",
    ];
    expect(computeStreak(keys, today)).toEqual({
      current: 2,
      best: 5,
      lastPlayedDate: "2026-07-31",
    });
  });

  it("counts a run that spans a month and a DST change", () => {
    const keys = ["2026-10-31", "2026-11-01", "2026-11-02"];
    expect(computeStreak(keys, "2026-11-02")).toMatchObject({
      current: 3,
      best: 3,
    });
  });

  it("drops unparseable days rather than breaking the count", () => {
    expect(
      computeStreak(["2026-07-30", "not-a-date", "", "2026-07-31"], today)
    ).toMatchObject({ current: 2, best: 2 });
  });

  it("does not treat a gap of two days as consecutive", () => {
    expect(computeStreak(["2026-07-28", "2026-07-30"], today)).toEqual({
      current: 1,
      best: 1,
      lastPlayedDate: "2026-07-30",
    });
  });

  it("ignores a run stranded in the future", () => {
    // Only reachable through a clock anomaly, since completed_at is written by
    // the server. It must not report a live streak the player never earned.
    expect(computeStreak(["2026-09-01", "2026-09-02"], today)).toMatchObject({
      current: 0,
      best: 2,
    });
  });
});

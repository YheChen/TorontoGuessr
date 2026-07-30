import { describe, expect, it } from "vitest";
import {
  advanceStreak,
  displayedStreak,
  EMPTY_STREAK,
  parseStreak,
  serializeStreak,
  type StreakState,
} from "@/lib/streak";

const state = (overrides: Partial<StreakState> = {}): StreakState => ({
  ...EMPTY_STREAK,
  ...overrides,
});

describe("advanceStreak", () => {
  it("starts a run at 1 on a first ever play", () => {
    expect(advanceStreak(EMPTY_STREAK, "2026-07-15")).toEqual({
      current: 1,
      best: 1,
      lastPlayedDate: "2026-07-15",
    });
  });

  it("increments when the last play was yesterday", () => {
    const next = advanceStreak(
      state({ current: 4, best: 9, lastPlayedDate: "2026-07-14" }),
      "2026-07-15",
    );
    expect(next).toEqual({
      current: 5,
      best: 9,
      lastPlayedDate: "2026-07-15",
    });
  });

  it("is idempotent for repeat plays on the same day", () => {
    const start = state({ current: 3, best: 3, lastPlayedDate: "2026-07-15" });
    const once = advanceStreak(start, "2026-07-15");
    const twice = advanceStreak(once, "2026-07-15");
    expect(once.current).toBe(3);
    expect(twice).toEqual(once);
  });

  it("resets to 1 after missing a day", () => {
    expect(
      advanceStreak(
        state({ current: 12, best: 12, lastPlayedDate: "2026-07-13" }),
        "2026-07-15",
      ),
    ).toEqual({ current: 1, best: 12, lastPlayedDate: "2026-07-15" });
  });

  it("resets after a long absence", () => {
    expect(
      advanceStreak(
        state({ current: 30, best: 30, lastPlayedDate: "2026-01-01" }),
        "2026-07-15",
      ).current,
    ).toBe(1);
  });

  it("raises best only when the run exceeds it", () => {
    expect(
      advanceStreak(
        state({ current: 9, best: 9, lastPlayedDate: "2026-07-14" }),
        "2026-07-15",
      ).best,
    ).toBe(10);
    expect(
      advanceStreak(
        state({ current: 2, best: 20, lastPlayedDate: "2026-07-14" }),
        "2026-07-15",
      ).best,
    ).toBe(20);
  });

  it("does not punish a stored date in the future", () => {
    // A clock change or a trip across time zones should not break a run.
    const next = advanceStreak(
      state({ current: 6, best: 6, lastPlayedDate: "2026-07-20" }),
      "2026-07-15",
    );
    expect(next.current).toBe(6);
    expect(next.lastPlayedDate).toBe("2026-07-20");
  });

  it("treats an unreadable stored date as a fresh run", () => {
    expect(
      advanceStreak(
        state({ current: 8, best: 8, lastPlayedDate: "not-a-date" }),
        "2026-07-15",
      ),
    ).toEqual({ current: 1, best: 8, lastPlayedDate: "2026-07-15" });
  });

  it("counts across a month boundary", () => {
    expect(
      advanceStreak(
        state({ current: 2, best: 2, lastPlayedDate: "2026-07-31" }),
        "2026-08-01",
      ).current,
    ).toBe(3);
  });

  it("counts across a DST change, since it compares calendar days", () => {
    // Toronto springs forward on 2026-03-08.
    expect(
      advanceStreak(
        state({ current: 1, best: 1, lastPlayedDate: "2026-03-07" }),
        "2026-03-08",
      ).current,
    ).toBe(2);
  });
});

describe("displayedStreak", () => {
  it("keeps a run alive when today has already been played", () => {
    const s = state({ current: 5, best: 5, lastPlayedDate: "2026-07-15" });
    expect(displayedStreak(s, "2026-07-15").current).toBe(5);
  });

  it("keeps a run alive the day after, so it can still be continued", () => {
    const s = state({ current: 5, best: 5, lastPlayedDate: "2026-07-14" });
    expect(displayedStreak(s, "2026-07-15").current).toBe(5);
  });

  it("shows a broken run as zero without needing a write", () => {
    const s = state({ current: 5, best: 9, lastPlayedDate: "2026-07-10" });
    const shown = displayedStreak(s, "2026-07-15");
    expect(shown.current).toBe(0);
    expect(shown.best).toBe(9);
  });

  it("leaves a never-played state alone", () => {
    expect(displayedStreak(EMPTY_STREAK, "2026-07-15")).toEqual(EMPTY_STREAK);
  });
});

describe("parseStreak", () => {
  it("round-trips a serialized state", () => {
    const s = state({ current: 3, best: 7, lastPlayedDate: "2026-07-15" });
    expect(parseStreak(serializeStreak(s))).toEqual(s);
  });

  it("returns an empty streak for missing or junk input", () => {
    expect(parseStreak(null)).toEqual(EMPTY_STREAK);
    expect(parseStreak("")).toEqual(EMPTY_STREAK);
    expect(parseStreak("not json")).toEqual(EMPTY_STREAK);
    expect(parseStreak("[]")).toEqual(EMPTY_STREAK);
  });

  it("discards a payload from an unknown version", () => {
    expect(
      parseStreak(
        JSON.stringify({ version: 99, current: 50, best: 50, lastPlayedDate: "2026-07-15" }),
      ),
    ).toEqual(EMPTY_STREAK);
  });

  it("rejects nonsense field types and negatives", () => {
    expect(
      parseStreak(
        JSON.stringify({ version: 1, current: "lots", best: -3, lastPlayedDate: 42 }),
      ),
    ).toEqual(EMPTY_STREAK);
  });
});

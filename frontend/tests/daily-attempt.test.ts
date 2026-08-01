// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  getClientId,
  hasPlayedDailyToday,
  markDailyPlayed,
  readDailyPlayed,
} from "@/lib/daily-attempt";

const KEYS = ["tg_client_id", "tg_daily_played"];

describe("the daily one-attempt guard", () => {
  beforeEach(() => {
    for (const key of KEYS) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* storage may be unavailable */
      }
    }
  });

  it("creates a client id once and then reuses it", () => {
    const first = getClientId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getClientId()).toBe(first);
  });

  it("reports no attempt before one is recorded", () => {
    expect(readDailyPlayed()).toBeNull();
    expect(hasPlayedDailyToday()).toBe(false);
  });

  it("records today and recognises it", () => {
    const now = new Date("2026-08-01T18:00:00Z");
    markDailyPlayed(now);
    expect(hasPlayedDailyToday(now)).toBe(true);
  });

  it("stops blocking once the Toronto day rolls over", () => {
    markDailyPlayed(new Date("2026-08-01T18:00:00Z"));
    expect(hasPlayedDailyToday(new Date("2026-08-02T18:00:00Z"))).toBe(false);
  });

  it("uses the Toronto boundary, not UTC", () => {
    // 02:00 UTC on the 2nd is still 22:00 on the 1st in Toronto, so an attempt
    // recorded at 18:00 UTC on the 1st must still count as used. Comparing on UTC
    // days would hand out a second attempt four hours early, every night.
    markDailyPlayed(new Date("2026-08-01T18:00:00Z"));
    expect(hasPlayedDailyToday(new Date("2026-08-02T02:00:00Z"))).toBe(true);
    // And 04:00 UTC on the 2nd IS a new Toronto day.
    expect(hasPlayedDailyToday(new Date("2026-08-02T05:00:00Z"))).toBe(false);
  });

  it("ignores a tampered date", () => {
    window.localStorage.setItem("tg_daily_played", "not-a-date");
    expect(readDailyPlayed()).toBeNull();
    expect(hasPlayedDailyToday()).toBe(false);
  });

  it("survives storage being blocked", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {
          throw new Error("SecurityError");
        },
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    try {
      // A player with storage disabled is not deduplicated, but must still be
      // able to play rather than being blocked or crashing.
      expect(getClientId()).toBeNull();
      expect(hasPlayedDailyToday()).toBe(false);
      expect(() => markDailyPlayed()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });
});

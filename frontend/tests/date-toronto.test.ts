import { describe, expect, it } from "vitest";
import { daysSinceLaunch, formatDay } from "@/lib/date-toronto";

describe("daysSinceLaunch", () => {
  it("is 1 on launch day (Toronto time)", () => {
    expect(daysSinceLaunch(new Date("2026-04-01T12:00:00Z"))).toBe(1);
  });

  it("counts inclusive days from launch", () => {
    expect(daysSinceLaunch(new Date("2026-04-10T12:00:00Z"))).toBe(10);
  });

  it("uses the Toronto calendar day, not UTC", () => {
    // 02:00 UTC on Apr 2 is still Apr 1 in Toronto (UTC-4), so day 1.
    expect(daysSinceLaunch(new Date("2026-04-02T02:00:00Z"))).toBe(1);
  });

  it("clamps to at least 1 before launch", () => {
    expect(daysSinceLaunch(new Date("2026-03-01T12:00:00Z"))).toBe(1);
  });

  it("clamps to the API maximum for far-future dates", () => {
    expect(daysSinceLaunch(new Date("2050-01-01T12:00:00Z"))).toBe(3650);
  });
});

describe("formatDay", () => {
  it("formats a YYYY-MM-DD key as a short month and day", () => {
    expect(formatDay("2026-07-15")).toBe("Jul 15");
    expect(formatDay("2026-01-01")).toBe("Jan 1");
    expect(formatDay("2026-12-09")).toBe("Dec 9");
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    expect(formatDay("not-a-date")).toBe("not-a-date");
    expect(formatDay("2026-13-40")).toBe("2026-13-40");
  });
});

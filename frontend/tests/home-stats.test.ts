import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadHomeStats,
  monthTicks,
  summarizeGameStats,
} from "@/lib/home-stats";
import type { DailyGameStatsEntry, GameStatsResponse } from "@/lib/types";

function day(
  date: string,
  gamesStarted: number,
  gamesFinished = 0,
): DailyGameStatsEntry {
  return { date, gamesStarted, gamesFinished };
}

function response(series: DailyGameStatsEntry[]): GameStatsResponse {
  return {
    days: series.length,
    timeZone: "America/Toronto",
    generatedAt: "2026-10-31T01:56:58.805Z",
    rangeStart: series[0]?.date ?? null,
    rangeEnd: series.at(-1)?.date ?? null,
    totals: {
      gamesStarted: series.reduce((sum, entry) => sum + entry.gamesStarted, 0),
      gamesFinished: series.reduce((sum, entry) => sum + entry.gamesFinished, 0),
    },
    series,
  };
}

/** `count` consecutive days from `from`, each with `perDay` games. */
function run(from: string, count: number, perDay: number): DailyGameStatsEntry[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    day(
      new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      perDay,
    ),
  );
}

describe("summarizeGameStats", () => {
  it("starts at the first game rather than at launch", () => {
    const stats = summarizeGameStats(
      response([
        day("2026-04-01", 0),
        day("2026-04-02", 0),
        day("2026-04-03", 4, 2),
        day("2026-04-04", 6, 3),
      ]),
    );

    expect(stats?.days.map((entry) => entry.date)).toEqual([
      "2026-04-03",
      "2026-04-04",
    ]);
    // The pre-game zeros must not count against the days anyone played.
    expect(stats?.daysWithPlay).toBe(2);
  });

  it("fills a day the API skipped with zeros instead of closing the gap", () => {
    const stats = summarizeGameStats(
      response([day("2026-05-01", 3), day("2026-05-03", 5)]),
    );

    expect(stats?.days).toEqual([
      day("2026-05-01", 3),
      day("2026-05-02", 0),
      day("2026-05-03", 5),
    ]);
    expect(stats?.daysWithPlay).toBe(2);
  });

  it("orders days by date whatever order they arrive in", () => {
    const stats = summarizeGameStats(
      response([day("2026-05-02", 1), day("2026-05-01", 2)]),
    );

    expect(stats?.days.map((entry) => entry.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
    ]);
  });

  it("sums only the last 30 days for the recent count", () => {
    const stats = summarizeGameStats(
      response([...run("2026-06-01", 10, 100), ...run("2026-06-11", 30, 2)]),
    );

    expect(stats?.gamesStartedLast30Days).toBe(60);
  });

  it("reports the totals the API computed", () => {
    const stats = summarizeGameStats(
      response([day("2026-07-01", 10, 4), day("2026-07-02", 20, 9)]),
    );

    expect(stats?.gamesStarted).toBe(30);
    expect(stats?.gamesFinished).toBe(13);
  });

  it("picks the busiest day, keeping the earlier one on a tie", () => {
    const stats = summarizeGameStats(
      response([
        day("2026-08-01", 5),
        day("2026-08-02", 9),
        day("2026-08-03", 9),
        day("2026-08-04", 1),
      ]),
    );

    expect(stats?.busiestDay.date).toBe("2026-08-02");
  });

  it("is null when nobody has played yet", () => {
    expect(summarizeGameStats(response([day("2026-04-01", 0)]))).toBeNull();
    expect(summarizeGameStats(response([]))).toBeNull();
  });
});

describe("monthTicks", () => {
  it("labels each month on its first day", () => {
    const ticks = monthTicks([
      ...run("2026-04-01", 30, 1),
      ...run("2026-05-01", 3, 1),
    ]);

    expect(ticks).toEqual([
      { index: 0, label: "Apr" },
      { index: 30, label: "May" },
    ]);
  });

  it("labels a partial opening month when there is room", () => {
    const ticks = monthTicks(run("2026-04-07", 30, 1));

    expect(ticks).toEqual([
      { index: 0, label: "Apr" },
      { index: 24, label: "May" },
    ]);
  });

  it("drops the opening label when the next month starts right after it", () => {
    const ticks = monthTicks(run("2026-04-28", 10, 1));

    expect(ticks).toEqual([{ index: 3, label: "May" }]);
  });

  it("puts the year on January", () => {
    const ticks = monthTicks(run("2026-12-01", 40, 1));

    expect(ticks.map((tick) => tick.label)).toEqual(["Dec", "Jan 2027"]);
  });
});

describe("loadHomeStats", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubApi(fetchImpl: () => Promise<unknown>) {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test/api/");
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    return fetchMock;
  }

  it("summarizes the live stats when the API answers", async () => {
    const fetchMock = stubApi(async () =>
      Response.json(response([day("2026-09-01", 12, 7)])),
    );

    const stats = await loadHomeStats();

    expect(stats?.gamesStarted).toBe(12);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/^https:\/\/api\.example\.test\/api\/stats\/games\?days=\d+$/);
  });

  it("is null when the API errors", async () => {
    stubApi(async () => new Response("nope", { status: 503 }));

    await expect(loadHomeStats()).resolves.toBeNull();
  });

  it("is null when the request itself fails", async () => {
    stubApi(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(loadHomeStats()).resolves.toBeNull();
  });

  it("is null when the response is not stats", async () => {
    stubApi(async () => Response.json({ error: "Not found" }));

    await expect(loadHomeStats()).resolves.toBeNull();
  });

  it("does not call out at all without a configured backend", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadHomeStats()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

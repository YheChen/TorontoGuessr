import { describe, expect, it } from "vitest";
import {
  createHttpError,
  isHttpError,
  matchRoute,
  normalizePathname,
} from "../src/http-utils.js";

describe("matchRoute", () => {
  it("extracts a single named parameter", () => {
    expect(matchRoute("/games/abc-123/guess", "/games/:sessionId/guess")).toEqual({
      sessionId: "abc-123",
    });
  });

  it("returns null when segment counts differ", () => {
    expect(matchRoute("/games/abc-123", "/games/:sessionId/guess")).toBeNull();
    expect(
      matchRoute("/games/abc-123/guess/extra", "/games/:sessionId/guess")
    ).toBeNull();
  });

  it("returns null when a static segment differs", () => {
    expect(matchRoute("/games/abc-123/next", "/games/:sessionId/guess")).toBeNull();
  });

  it("matches static routes with an empty params object", () => {
    expect(matchRoute("/leaderboard", "/leaderboard")).toEqual({});
  });

  it("ignores leading and trailing slashes consistently", () => {
    expect(matchRoute("/games/x/guess/", "/games/:sessionId/guess")).toEqual({
      sessionId: "x",
    });
  });
});

describe("normalizePathname", () => {
  it("strips the /api prefix", () => {
    expect(normalizePathname("/api/health")).toBe("/health");
    expect(normalizePathname("/api/stats/games")).toBe("/stats/games");
  });

  it("maps the bare /api root to /", () => {
    expect(normalizePathname("/api")).toBe("/");
    expect(normalizePathname("/api/")).toBe("/");
  });

  it("leaves non-api paths untouched (local server)", () => {
    expect(normalizePathname("/health")).toBe("/health");
    expect(normalizePathname("/stats/games")).toBe("/stats/games");
  });
});

describe("createHttpError / isHttpError", () => {
  it("round-trips a status code through an Error", () => {
    const error = createHttpError(401, "Unauthorized.");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Unauthorized.");
    expect(isHttpError(error)).toBe(true);
    expect(error.statusCode).toBe(401);
  });

  it("rejects plain errors and non-errors", () => {
    expect(isHttpError(new Error("plain"))).toBe(false);
    expect(isHttpError({ statusCode: 500 })).toBe(false);
    expect(isHttpError(null)).toBe(false);
  });
});

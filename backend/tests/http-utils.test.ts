import { describe, expect, it } from "vitest";
import type { ServerResponse } from "node:http";
import {
  createHttpError,
  isHttpError,
  matchRoute,
  normalizePathname,
  setCorsHeaders,
} from "../src/http-utils.js";

describe("setCorsHeaders", () => {
  function capture(): Record<string, string> {
    const headers: Record<string, string> = {};
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    } as unknown as ServerResponse;
    setCorsHeaders(response);
    return headers;
  }

  it("allows every custom header the app actually sends", () => {
    // A header missing here fails the browser preflight, which curl never
    // exercises: x-player-token authenticates lobby players.
    const allowed = capture()["Access-Control-Allow-Headers"] ?? "";
    for (const header of [
      "Content-Type",
      "X-Admin-Token",
      "X-Player-Token",
      "Authorization",
    ]) {
      expect(allowed).toContain(header);
    }
  });

  it("allows the methods the routes use", () => {
    const methods = capture()["Access-Control-Allow-Methods"] ?? "";
    for (const method of ["GET", "POST", "PATCH", "DELETE", "OPTIONS"]) {
      expect(methods).toContain(method);
    }
  });

  it("caches the preflight", () => {
    expect(capture()["Access-Control-Max-Age"]).toBe("86400");
  });
});

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

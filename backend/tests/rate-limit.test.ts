import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clientIp,
  enforceRateLimit,
  resetRateLimits,
} from "../src/rate-limit.js";
import type { IncomingMessage, ServerResponse } from "node:http";

const opts = { limit: 3, windowMs: 1000 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows requests up to the limit, then blocks", () => {
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    expect(checkRateLimit("k", opts, 0).allowed).toBe(true);
    const blocked = checkRateLimit("k", opts, 0);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("resets after the window elapses", () => {
    for (let i = 0; i < 3; i += 1) checkRateLimit("k", opts, 0);
    expect(checkRateLimit("k", opts, 0).allowed).toBe(false);
    // A tick past the window boundary starts a fresh window.
    expect(checkRateLimit("k", opts, 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    for (let i = 0; i < 3; i += 1) checkRateLimit("a", opts, 0);
    expect(checkRateLimit("a", opts, 0).allowed).toBe(false);
    expect(checkRateLimit("b", opts, 0).allowed).toBe(true);
  });

  it("reports decreasing remaining allowance", () => {
    expect(checkRateLimit("k", opts, 0).remaining).toBe(2);
    expect(checkRateLimit("k", opts, 0).remaining).toBe(1);
    expect(checkRateLimit("k", opts, 0).remaining).toBe(0);
  });
});

describe("clientIp", () => {
  const make = (headers: Record<string, string | string[]>, remote?: string) =>
    ({
      headers,
      socket: { remoteAddress: remote },
    }) as unknown as IncomingMessage;

  it("uses the first x-forwarded-for entry", () => {
    expect(
      clientIp(make({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip then socket", () => {
    expect(clientIp(make({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIp(make({}, "192.0.2.5"))).toBe("192.0.2.5");
  });

  it("returns 'unknown' when nothing is available", () => {
    expect(clientIp(make({}))).toBe("unknown");
  });
});

describe("enforceRateLimit", () => {
  beforeEach(() => resetRateLimits());

  const request = (ip = "203.0.113.7") =>
    ({
      headers: { "x-forwarded-for": ip },
      socket: { remoteAddress: ip },
    }) as unknown as IncomingMessage;

  /** Captures what the helper sets, standing in for a real ServerResponse. */
  function response() {
    const headers = new Map<string, string>();
    return {
      headers,
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as ServerResponse & { headers: Map<string, string> };
  }

  const run = (
    req: IncomingMessage,
    res: ServerResponse,
    bucket = "test",
    limit = 2
  ) => enforceRateLimit(req, res, bucket, { limit }, "Slow down.");

  it("stays silent while the caller is under the limit", () => {
    const res = response();
    expect(() => run(request(), res)).not.toThrow();
    expect(() => run(request(), res)).not.toThrow();
  });

  it("throws a 429 carrying the supplied message once over", () => {
    const res = response();
    run(request(), res);
    run(request(), res);

    expect(() => run(request(), res)).toThrowError("Slow down.");
    expect(statusOf(() => run(request(), res))).toBe(429);
  });

  it("sets Retry-After only on the refusal", () => {
    const res = response();
    run(request(), res);
    expect(res.headers.has("Retry-After")).toBe(false);

    statusOf(() => {
      run(request(), res);
      run(request(), res);
    });
    // A one-minute window, so the wait is reported in whole seconds up to 60.
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(Number(res.headers.get("Retry-After"))).toBeLessThanOrEqual(60);
  });

  it("gives each bucket its own allowance", () => {
    const res = response();
    run(request(), res, "bucket-a");
    run(request(), res, "bucket-a");
    expect(statusOf(() => run(request(), res, "bucket-a"))).toBe(429);
    // A different route must not inherit the exhausted counter.
    expect(() => run(request(), res, "bucket-b")).not.toThrow();
  });

  it("gives each address its own allowance", () => {
    const res = response();
    run(request("198.51.100.1"), res);
    run(request("198.51.100.1"), res);
    expect(statusOf(() => run(request("198.51.100.1"), res))).toBe(429);
    expect(() => run(request("198.51.100.2"), res)).not.toThrow();
  });
});

/** The thrown HttpError's status, or a marker when nothing was thrown. */
function statusOf(fn: () => void): number | "no throw" {
  try {
    fn();
    return "no throw";
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? -1;
  }
}

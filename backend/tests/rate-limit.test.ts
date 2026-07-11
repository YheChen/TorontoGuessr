import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientIp, resetRateLimits } from "../src/rate-limit.js";
import type { IncomingMessage } from "node:http";

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

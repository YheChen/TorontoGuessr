import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  extractAdminToken,
  requireAdminToken,
  safeTokenEqual,
} from "../src/admin-auth.js";
import { resetRateLimits } from "../src/rate-limit.js";

const TOKEN = "correct-horse-battery-staple-0123456789";

function request(
  headers: Record<string, string | string[]> = {},
  ip = "203.0.113.7"
): IncomingMessage {
  return {
    headers: { "x-forwarded-for": ip, ...headers },
    socket: { remoteAddress: ip },
  } as unknown as IncomingMessage;
}

function statusOf(run: () => void): number | "no throw" {
  try {
    run();
    return "no throw";
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? -1;
  }
}

describe("safeTokenEqual", () => {
  it("matches identical tokens", () => {
    expect(safeTokenEqual(TOKEN, TOKEN)).toBe(true);
  });

  it("rejects different tokens", () => {
    expect(safeTokenEqual(TOKEN, `${TOKEN}x`)).toBe(false);
    expect(safeTokenEqual("a", "b")).toBe(false);
  });

  it("handles length mismatches without throwing", () => {
    // timingSafeEqual throws on unequal buffers, so both sides are hashed to a
    // fixed width first. A raw length check would also leak the secret length.
    expect(() => safeTokenEqual("short", TOKEN)).not.toThrow();
    expect(safeTokenEqual("short", TOKEN)).toBe(false);
    expect(safeTokenEqual("", TOKEN)).toBe(false);
  });

  it("is case and whitespace sensitive", () => {
    expect(safeTokenEqual(TOKEN, TOKEN.toUpperCase())).toBe(false);
    expect(safeTokenEqual(TOKEN, ` ${TOKEN}`)).toBe(false);
  });

  it("compares unicode by bytes without throwing", () => {
    expect(safeTokenEqual("héllo", "héllo")).toBe(true);
    expect(safeTokenEqual("héllo", "hello")).toBe(false);
  });
});

describe("extractAdminToken", () => {
  it("prefers the dedicated header", () => {
    expect(
      extractAdminToken(
        request({ "x-admin-token": "from-header", authorization: "Bearer from-bearer" })
      )
    ).toBe("from-header");
  });

  it("falls back to a bearer token", () => {
    expect(extractAdminToken(request({ authorization: "Bearer abc" }))).toBe("abc");
  });

  it("trims surrounding whitespace", () => {
    expect(extractAdminToken(request({ "x-admin-token": "  abc  " }))).toBe("abc");
  });

  it("returns null when absent, blank, or a non-bearer scheme", () => {
    expect(extractAdminToken(request())).toBe(null);
    expect(extractAdminToken(request({ "x-admin-token": "   " }))).toBe(null);
    expect(extractAdminToken(request({ authorization: "Bearer " }))).toBe(null);
    expect(extractAdminToken(request({ authorization: "Basic abc" }))).toBe(null);
  });
});

describe("requireAdminToken", () => {
  const originalToken = process.env.ADMIN_REVIEW_TOKEN;

  beforeEach(() => {
    resetRateLimits();
    process.env.ADMIN_REVIEW_TOKEN = TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.ADMIN_REVIEW_TOKEN;
    } else {
      process.env.ADMIN_REVIEW_TOKEN = originalToken;
    }
  });

  it("accepts the correct token", () => {
    expect(
      statusOf(() => requireAdminToken(request({ "x-admin-token": TOKEN })))
    ).toBe("no throw");
  });

  it("rejects a wrong or missing token with 401", () => {
    expect(statusOf(() => requireAdminToken(request({ "x-admin-token": "nope" })))).toBe(401);
    expect(statusOf(() => requireAdminToken(request()))).toBe(401);
  });

  it("reports 500 when the server has no token configured", () => {
    delete process.env.ADMIN_REVIEW_TOKEN;
    expect(statusOf(() => requireAdminToken(request({ "x-admin-token": TOKEN })))).toBe(500);
  });

  it("locks an address out with 429 after repeated failures", () => {
    const attacker = request({ "x-admin-token": "guess" }, "198.51.100.9");
    // The first ten guesses are simply unauthorized.
    for (let i = 0; i < 10; i += 1) {
      expect(statusOf(() => requireAdminToken(attacker))).toBe(401);
    }
    // The eleventh is refused outright, which is what makes brute force useless.
    expect(statusOf(() => requireAdminToken(attacker))).toBe(429);
    expect(statusOf(() => requireAdminToken(attacker))).toBe(429);
  });

  it("counts failures per address, so one attacker cannot lock out others", () => {
    const attacker = request({ "x-admin-token": "guess" }, "198.51.100.9");
    for (let i = 0; i < 12; i += 1) {
      attemptAdminAuth(attacker);
    }
    // A different address is unaffected and a valid token still works.
    expect(
      statusOf(() =>
        requireAdminToken(request({ "x-admin-token": TOKEN }, "203.0.113.7"))
      )
    ).toBe("no throw");
  });

  it("does not spend the failure budget on successful requests", () => {
    const good = request({ "x-admin-token": TOKEN }, "192.0.2.50");
    for (let i = 0; i < 30; i += 1) {
      expect(statusOf(() => requireAdminToken(good))).toBe("no throw");
    }
    // Only failures count, so a legitimate session keeps its full allowance.
    expect(statusOf(() => requireAdminToken(request({ "x-admin-token": "nope" }, "192.0.2.50")))).toBe(401);
  });

  it("caps overall request volume per address", () => {
    const good = request({ "x-admin-token": TOKEN }, "192.0.2.77");
    for (let i = 0; i < 120; i += 1) {
      requireAdminToken(good);
    }
    expect(statusOf(() => requireAdminToken(good))).toBe(429);
  });
});

/** Runs an attempt where the thrown status is not what is being asserted. */
function attemptAdminAuth(request: IncomingMessage): void {
  try {
    requireAdminToken(request);
  } catch {
    // expected
  }
}

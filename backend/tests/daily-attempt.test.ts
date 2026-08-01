import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  CLIENT_ID_HEADER,
  dailyAttemptKey,
  readClientId,
  resolveDailyKey,
} from "../src/daily-attempt.js";

function requestWith(headers: Record<string, unknown>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

describe("dailyAttemptKey", () => {
  it("is a hex sha256 digest", () => {
    expect(dailyAttemptKey("2026-08-01", "abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is stable for the same day and player", () => {
    expect(dailyAttemptKey("2026-08-01", "abc")).toBe(
      dailyAttemptKey("2026-08-01", "abc")
    );
  });

  it("differs between players on the same day", () => {
    expect(dailyAttemptKey("2026-08-01", "abc")).not.toBe(
      dailyAttemptKey("2026-08-01", "abd")
    );
  });

  it("differs for the SAME player across days", () => {
    // The whole privacy property. If the date were not in the hash, the stored
    // column would be a stable per-browser identifier and could be used to follow
    // one player from one day to the next. Nothing needs that.
    expect(dailyAttemptKey("2026-08-01", "abc")).not.toBe(
      dailyAttemptKey("2026-08-02", "abc")
    );
  });

  it("cannot be confused by a colon in the identity", () => {
    // "a" on day "b:c" must not hash the same as "a:b" on day "c". A naive
    // concatenation without a fixed separator position would collide here, and a
    // collision means one player blocking another's attempt.
    expect(dailyAttemptKey("b:c", "a")).not.toBe(dailyAttemptKey("c", "a:b"));
  });

  it("never returns the identity it was given", () => {
    expect(dailyAttemptKey("2026-08-01", "secret-id")).not.toContain("secret-id");
  });
});

describe("readClientId", () => {
  it("reads and trims the header", () => {
    expect(readClientId(requestWith({ [CLIENT_ID_HEADER]: "  abc " }))).toBe("abc");
  });

  it("reports nothing for an absent or blank header", () => {
    expect(readClientId(requestWith({}))).toBeNull();
    expect(readClientId(requestWith({ [CLIENT_ID_HEADER]: "   " }))).toBeNull();
  });

  it("ignores a repeated header", () => {
    // Node gives an array when a header arrives twice. Picking one would let a
    // caller shop for an identity that has not played yet.
    expect(
      readClientId(requestWith({ [CLIENT_ID_HEADER]: ["a", "b"] }))
    ).toBeNull();
  });

  it("refuses an absurdly long id", () => {
    expect(
      readClientId(requestWith({ [CLIENT_ID_HEADER]: "x".repeat(101) }))
    ).toBeNull();
    expect(
      readClientId(requestWith({ [CLIENT_ID_HEADER]: "x".repeat(100) }))
    ).not.toBeNull();
  });
});

describe("resolveDailyKey", () => {
  it("prefers the account over the browser", () => {
    // A signed-in player must not be able to escape the limit by clearing
    // storage, so the account id wins whenever there is one.
    const withUser = resolveDailyKey("2026-08-01", {
      userId: "user-1",
      clientId: "browser-1",
    });
    expect(withUser).toBe(dailyAttemptKey("2026-08-01", "user-1"));
    expect(withUser).not.toBe(dailyAttemptKey("2026-08-01", "browser-1"));
  });

  it("falls back to the browser for a guest", () => {
    expect(resolveDailyKey("2026-08-01", { clientId: "browser-1" })).toBe(
      dailyAttemptKey("2026-08-01", "browser-1")
    );
  });

  it("returns null when there is no identity at all", () => {
    // Null means "not deduplicated", which the partial unique index ignores.
    // Refusing instead would stop anyone with storage disabled from ever playing
    // the daily, which is a worse outcome than an undeduplicated attempt.
    expect(resolveDailyKey("2026-08-01", {})).toBeNull();
    expect(
      resolveDailyKey("2026-08-01", { userId: null, clientId: null })
    ).toBeNull();
  });

  it("returns null when there is no challenge date", () => {
    // Every mode but the daily. Nothing else should ever be keyed by this.
    expect(resolveDailyKey(null, { clientId: "browser-1" })).toBeNull();
  });
});

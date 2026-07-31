import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  PLAY_TOKEN_HEADER,
  createPlayToken,
  hashPlayToken,
  readPlayToken,
  requirePlayToken,
} from "../src/play-token.js";

function requestWith(headers: Record<string, unknown>): IncomingMessage {
  return { headers } as unknown as IncomingMessage;
}

/** The status a thrown HttpError carries, or null if it threw nothing. */
function statusOf(run: () => void): number | null {
  try {
    run();
    return null;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? -1;
  }
}

describe("createPlayToken", () => {
  it("is 32 bytes of hex", () => {
    expect(createPlayToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not repeat", () => {
    const tokens = new Set(
      Array.from({ length: 200 }, () => createPlayToken())
    );
    expect(tokens.size).toBe(200);
  });
});

describe("hashPlayToken", () => {
  it("is a hex sha256 digest", () => {
    expect(hashPlayToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("never returns the token it was given", () => {
    const token = createPlayToken();
    expect(hashPlayToken(token)).not.toBe(token);
  });
});

describe("readPlayToken", () => {
  it("reads the header", () => {
    expect(readPlayToken(requestWith({ [PLAY_TOKEN_HEADER]: "abc" }))).toBe(
      "abc"
    );
  });

  it("trims, and treats whitespace as absent", () => {
    expect(readPlayToken(requestWith({ [PLAY_TOKEN_HEADER]: "  abc " }))).toBe(
      "abc"
    );
    expect(readPlayToken(requestWith({ [PLAY_TOKEN_HEADER]: "   " }))).toBeNull();
    expect(readPlayToken(requestWith({ [PLAY_TOKEN_HEADER]: "" }))).toBeNull();
  });

  it("reports nothing when the header is absent", () => {
    expect(readPlayToken(requestWith({}))).toBeNull();
  });

  it("ignores a repeated header", () => {
    // Node hands back an array when a header arrives twice. Picking one at
    // random would let an attacker append their own token to a victim's
    // request and have it maybe accepted.
    expect(
      readPlayToken(requestWith({ [PLAY_TOKEN_HEADER]: ["a", "b"] }))
    ).toBeNull();
  });
});

describe("requirePlayToken", () => {
  it("accepts the matching token", () => {
    const token = createPlayToken();
    expect(statusOf(() => requirePlayToken(hashPlayToken(token), token))).toBeNull();
  });

  it("refuses a token for a different session", () => {
    const stored = hashPlayToken(createPlayToken());
    expect(statusOf(() => requirePlayToken(stored, createPlayToken()))).toBe(403);
  });

  it("refuses a missing token when the session has a hash", () => {
    const stored = hashPlayToken(createPlayToken());
    expect(statusOf(() => requirePlayToken(stored, null))).toBe(401);
    expect(statusOf(() => requirePlayToken(stored, ""))).toBe(401);
  });

  it("grandfathers a session that has no hash", () => {
    // Sessions from before the feature, and sessions started between the
    // migration and the deploy. Refusing them would end a game in progress.
    for (const stored of [null, undefined, ""]) {
      expect(statusOf(() => requirePlayToken(stored, null))).toBeNull();
      expect(statusOf(() => requirePlayToken(stored, "anything"))).toBeNull();
    }
  });

  it("refuses the stored hash when it is offered as the token", () => {
    // The hash is what a database leak exposes. Presenting it back must not
    // work, or storing the hash instead of the token would have bought nothing.
    const stored = hashPlayToken(createPlayToken());
    expect(statusOf(() => requirePlayToken(stored, stored))).toBe(403);
  });

  it("refuses the migration's sentinel and anything shaped like it", () => {
    // add_play_token_to_game_sessions.sql backfills a value that is not a
    // 64-character hex digest, so no token can hash to it. Both the sentinel
    // itself and a plausible guess at a token must be refused.
    const sentinel = "legacy-session-no-token-issued";
    expect(statusOf(() => requirePlayToken(sentinel, sentinel))).toBe(403);
    expect(statusOf(() => requirePlayToken(sentinel, createPlayToken()))).toBe(
      403
    );
    expect(statusOf(() => requirePlayToken(sentinel, null))).toBe(401);
  });

  it("compares tokens of different lengths without throwing", () => {
    // timingSafeEqual rejects buffers of unequal length, so a short token would
    // crash the route with a 500 instead of refusing it, and the crash itself
    // would leak that the length was wrong.
    const stored = hashPlayToken(createPlayToken());
    for (const token of ["a", "a".repeat(1000), "🙂"]) {
      expect(statusOf(() => requirePlayToken(stored, token))).toBe(403);
    }
  });
});

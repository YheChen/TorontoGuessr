import { describe, expect, it } from "vitest";
import { buildChallengeUrl, parseGameParams } from "@/lib/game-params";

describe("parseGameParams", () => {
  it("defaults to classic", () => {
    expect(parseGameParams("")).toEqual({
      mode: "classic",
      challengeCode: null,
    });
    expect(parseGameParams("?foo=bar")).toEqual({
      mode: "classic",
      challengeCode: null,
    });
  });

  it("reads daily mode", () => {
    expect(parseGameParams("?mode=daily")).toEqual({
      mode: "daily",
      challengeCode: null,
    });
  });

  it("reads challenge mode with a code", () => {
    expect(parseGameParams("?mode=challenge&c=ABC234")).toEqual({
      mode: "challenge",
      challengeCode: "ABC234",
    });
  });

  it("falls back to classic when a challenge has no code", () => {
    // Starting a challenge with nothing to resolve would just error.
    expect(parseGameParams("?mode=challenge")).toEqual({
      mode: "classic",
      challengeCode: null,
    });
    expect(parseGameParams("?mode=challenge&c=")).toEqual({
      mode: "classic",
      challengeCode: null,
    });
    expect(parseGameParams("?mode=challenge&c=%20%20")).toEqual({
      mode: "classic",
      challengeCode: null,
    });
  });

  it("ignores unknown modes", () => {
    expect(parseGameParams("?mode=endless")).toEqual({
      mode: "classic",
      challengeCode: null,
    });
  });

  it("passes the raw code through for the backend to normalize", () => {
    expect(parseGameParams("?mode=challenge&c=abc-234").challengeCode).toBe(
      "abc-234"
    );
  });
});

describe("buildChallengeUrl", () => {
  it("builds a playable challenge link", () => {
    expect(buildChallengeUrl("https://www.torontoguessr.ca", "ABC234")).toBe(
      "https://www.torontoguessr.ca/game?mode=challenge&c=ABC234"
    );
  });

  it("does not double up the slash", () => {
    expect(buildChallengeUrl("http://localhost:3000/", "ABC234")).toBe(
      "http://localhost:3000/game?mode=challenge&c=ABC234"
    );
  });

  it("encodes the code", () => {
    expect(buildChallengeUrl("https://x.ca", "A B")).toContain("c=A%20B");
  });
});

import { describe, expect, it } from "vitest";
import {
  CHALLENGE_CODE_LENGTH,
  generateChallengeCode,
  normalizeChallengeCode,
} from "../src/challenge-code.js";

describe("generateChallengeCode", () => {
  it("produces codes of the expected length", () => {
    expect(generateChallengeCode()).toHaveLength(CHALLENGE_CODE_LENGTH);
  });

  it("only uses the unambiguous alphabet", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      // No I, L, O, or U, so codes cannot be misread as 1, 0, or V.
      expect(generateChallengeCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    }
  });

  it("does not return the same code every call", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateChallengeCode())
    );
    expect(codes.size).toBeGreaterThan(1);
  });

  it("round-trips through normalization unchanged", () => {
    const code = generateChallengeCode();
    expect(normalizeChallengeCode(code)).toBe(code);
  });
});

describe("normalizeChallengeCode", () => {
  it("uppercases lowercase input", () => {
    expect(normalizeChallengeCode("abc234")).toBe("ABC234");
  });

  it("strips whitespace and separators", () => {
    expect(normalizeChallengeCode("  ABC-234 ")).toBe("ABC234");
    expect(normalizeChallengeCode("AB C2 34")).toBe("ABC234");
  });

  it("folds omitted look-alike characters onto the alphabet", () => {
    // I and L read as 1; O reads as 0.
    expect(normalizeChallengeCode("IL2345")).toBe("112345");
    expect(normalizeChallengeCode("OO2345")).toBe("002345");
    expect(normalizeChallengeCode("iloveu".toUpperCase())).toBe(null);
  });

  it("rejects codes of the wrong length", () => {
    expect(normalizeChallengeCode("ABC23")).toBe(null);
    expect(normalizeChallengeCode("ABC2345")).toBe(null);
    expect(normalizeChallengeCode("")).toBe(null);
  });

  it("rejects non-string input", () => {
    expect(normalizeChallengeCode(undefined)).toBe(null);
    expect(normalizeChallengeCode(null)).toBe(null);
    expect(normalizeChallengeCode(123456)).toBe(null);
  });
});

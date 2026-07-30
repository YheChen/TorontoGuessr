import { describe, expect, it } from "vitest";
import {
  SHORT_CODE_LENGTH,
  generateShortCode,
  normalizeShortCode,
} from "../src/short-code.js";

describe("generateShortCode", () => {
  it("produces codes of the expected length", () => {
    expect(generateShortCode()).toHaveLength(SHORT_CODE_LENGTH);
  });

  it("only uses the unambiguous alphabet", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      // No I, L, O, or U, so codes cannot be misread as 1, 0, or V.
      expect(generateShortCode()).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    }
  });

  it("does not return the same code every call", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateShortCode())
    );
    expect(codes.size).toBeGreaterThan(1);
  });

  it("round-trips through normalization unchanged", () => {
    const code = generateShortCode();
    expect(normalizeShortCode(code)).toBe(code);
  });
});

describe("normalizeShortCode", () => {
  it("uppercases lowercase input", () => {
    expect(normalizeShortCode("abc234")).toBe("ABC234");
  });

  it("strips whitespace and separators", () => {
    expect(normalizeShortCode("  ABC-234 ")).toBe("ABC234");
    expect(normalizeShortCode("AB C2 34")).toBe("ABC234");
  });

  it("folds omitted look-alike characters onto the alphabet", () => {
    // I and L read as 1; O reads as 0.
    expect(normalizeShortCode("IL2345")).toBe("112345");
    expect(normalizeShortCode("OO2345")).toBe("002345");
    expect(normalizeShortCode("iloveu".toUpperCase())).toBe(null);
  });

  it("rejects codes of the wrong length", () => {
    expect(normalizeShortCode("ABC23")).toBe(null);
    expect(normalizeShortCode("ABC2345")).toBe(null);
    expect(normalizeShortCode("")).toBe(null);
  });

  it("rejects non-string input", () => {
    expect(normalizeShortCode(undefined)).toBe(null);
    expect(normalizeShortCode(null)).toBe(null);
    expect(normalizeShortCode(123456)).toBe(null);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_USERNAME,
  createGuestUsername,
  resolveDefaultUsername,
  sanitizeUsername,
} from "../src/username-utils.js";

describe("sanitizeUsername", () => {
  it("accepts simple alphanumeric names and trims whitespace", () => {
    expect(sanitizeUsername("Yanzhen1")).toBe("Yanzhen1");
    expect(sanitizeUsername("  Toronto6 ")).toBe("Toronto6");
  });

  it("generates a guest name for empty or non-string input", () => {
    expect(sanitizeUsername("")).toMatch(/^Guest \d{4}$/);
    expect(sanitizeUsername("   ")).toMatch(/^Guest \d{4}$/);
    expect(sanitizeUsername(undefined)).toMatch(/^Guest \d{4}$/);
    expect(sanitizeUsername(42)).toMatch(/^Guest \d{4}$/);
  });

  it("rejects names longer than 10 characters", () => {
    expect(() => sanitizeUsername("elevenchars")).toThrow(
      /1-10 letters or numbers/
    );
  });

  it("rejects names with special characters or spaces", () => {
    expect(() => sanitizeUsername("to ronto")).toThrow();
    expect(() => sanitizeUsername("name!")).toThrow();
    expect(() => sanitizeUsername("héllo")).toThrow();
  });

  it("blocks profanity, case-insensitively", () => {
    expect(() => sanitizeUsername("fuck")).toThrow(/not allowed/);
    expect(() => sanitizeUsername("ShItPost")).toThrow(/not allowed/);
  });

  it("blocks leetspeak variants of profanity", () => {
    expect(() => sanitizeUsername("sh1t")).toThrow(/not allowed/);
    expect(() => sanitizeUsername("b1tch")).toThrow(/not allowed/);
    expect(() => sanitizeUsername("5hit")).toThrow(/not allowed/);
  });

  it("allows benign names that merely contain digits", () => {
    expect(sanitizeUsername("player1")).toBe("player1");
    expect(sanitizeUsername("The6ix")).toBe("The6ix");
  });
});

describe("createGuestUsername", () => {
  it("produces a Guest name with a 4-digit suffix", () => {
    expect(createGuestUsername()).toMatch(/^Guest \d{4}$/);
  });
});

describe("resolveDefaultUsername", () => {
  it("passes real usernames through", () => {
    expect(resolveDefaultUsername("Yanzhen", "seed")).toBe("Yanzhen");
  });

  it("maps the legacy bare Guest name to a seeded suffix", () => {
    const a = resolveDefaultUsername("Guest", "session-123");
    const b = resolveDefaultUsername("Guest", "session-123");
    expect(a).toMatch(/^Guest \d{4}$/);
    expect(a).toBe(b);
  });

  it("differs across seeds", () => {
    const a = resolveDefaultUsername(null, "session-a");
    const b = resolveDefaultUsername(null, "session-b");
    expect(a).not.toBe(b);
  });

  it("falls back to the default when no seed is available", () => {
    expect(resolveDefaultUsername(null)).toBe(DEFAULT_USERNAME);
    expect(resolveDefaultUsername("Guest", "")).toBe(DEFAULT_USERNAME);
  });
});

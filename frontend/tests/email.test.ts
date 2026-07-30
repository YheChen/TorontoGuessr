import { describe, expect, it } from "vitest";
import { isLikelyEmail, normalizeEmail } from "@/lib/email";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Me@Example.COM ")).toBe("me@example.com");
  });

  it("leaves an already normal address alone", () => {
    expect(normalizeEmail("me@example.com")).toBe("me@example.com");
  });
});

describe("isLikelyEmail", () => {
  it("accepts ordinary addresses", () => {
    expect(isLikelyEmail("me@example.com")).toBe(true);
    expect(isLikelyEmail("a@b.co")).toBe(true);
  });

  it("accepts the awkward but legal ones", () => {
    // A strict regex tends to wrongly reject these.
    expect(isLikelyEmail("first.last+tag@sub.example.co.uk")).toBe(true);
    expect(isLikelyEmail("a_b-c@example.io")).toBe(true);
  });

  it("normalizes before judging", () => {
    expect(isLikelyEmail("  Me@Example.com  ")).toBe(true);
  });

  it("rejects a missing or doubled @", () => {
    expect(isLikelyEmail("me.example.com")).toBe(false);
    expect(isLikelyEmail("me@@example.com")).toBe(false);
    expect(isLikelyEmail("me@ex@ample.com")).toBe(false);
  });

  it("rejects a domain without a dot", () => {
    expect(isLikelyEmail("me@localhost")).toBe(false);
  });

  it("rejects empty domain parts", () => {
    expect(isLikelyEmail("me@example.")).toBe(false);
    expect(isLikelyEmail("me@.com")).toBe(false);
    expect(isLikelyEmail("me@exam..ple.com")).toBe(false);
  });

  it("rejects a missing local part", () => {
    expect(isLikelyEmail("@example.com")).toBe(false);
  });

  it("rejects whitespace anywhere", () => {
    expect(isLikelyEmail("me @example.com")).toBe(false);
    expect(isLikelyEmail("me@exa mple.com")).toBe(false);
  });

  it("rejects empty and absurd lengths", () => {
    expect(isLikelyEmail("")).toBe(false);
    expect(isLikelyEmail("a@b.c")).toBe(false);
    expect(isLikelyEmail(`${"a".repeat(250)}@example.com`)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  displayNamesCollide,
  validateDisplayName,
} from "../src/display-name.js";

function reason(input: unknown): string {
  const result = validateDisplayName(input);
  return result.ok ? "(accepted)" : result.reason;
}

describe("validateDisplayName", () => {
  it("accepts a normal name and preserves its case", () => {
    const result = validateDisplayName("YanZhen");
    expect(result).toEqual({
      ok: true,
      value: "YanZhen",
      comparisonKey: "yanzhen",
    });
  });

  it("accepts letters, numbers, and underscores", () => {
    for (const name of ["abc", "Player_1", "the6ix", "a_b_c", "X__9"]) {
      expect(validateDisplayName(name).ok).toBe(true);
    }
  });

  it("trims surrounding whitespace", () => {
    const result = validateDisplayName("  Neo  ");
    expect(result.ok && result.value).toBe("Neo");
  });

  it("enforces the length bounds", () => {
    expect(reason("ab")).toMatch(/at least 3/);
    expect(validateDisplayName("abc").ok).toBe(true);
    expect(validateDisplayName("a".repeat(16)).ok).toBe(true);
    expect(reason("a".repeat(17))).toMatch(/at most 16/);
  });

  it("rejects characters that are not letters, numbers, or underscores", () => {
    for (const name of ["hi there", "no-dash", "emoji🔥", "semi;colon", "a.b", "<b>x</b>"]) {
      expect(validateDisplayName(name).ok).toBe(false);
    }
  });

  it("rejects a name with no letters or numbers", () => {
    expect(reason("____")).toMatch(/at least one letter or number/);
  });

  it("rejects reserved names regardless of case", () => {
    for (const name of ["admin", "ADMIN", "Moderator", "staff", "TorontoGuessr", "system"]) {
      expect(reason(name)).toMatch(/reserved/);
    }
  });

  it("blocks impersonating the auto-assigned guest names", () => {
    // Unattributed games already display as "Guest NNNN".
    expect(reason("guest")).toMatch(/reserved/);
    expect(reason("Guest1234")).toMatch(/reserved/);
    expect(reason("GUEST_0001")).toMatch(/reserved/);
    // A name that merely starts with those letters is fine.
    expect(validateDisplayName("Guestimate").ok).toBe(true);
  });

  it("rejects empty and non-string input", () => {
    expect(reason("")).toMatch(/Enter a display name/);
    expect(reason("   ")).toMatch(/Enter a display name/);
    expect(reason(undefined)).toMatch(/Enter a display name/);
    expect(reason(null)).toMatch(/Enter a display name/);
    expect(reason(42)).toMatch(/Enter a display name/);
  });

  it("reports the comparison key the uniqueness index uses", () => {
    const result = validateDisplayName("MiXeDCaSe");
    expect(result.ok && result.comparisonKey).toBe("mixedcase");
  });
});

describe("displayNamesCollide", () => {
  it("treats names differing only by case as the same", () => {
    expect(displayNamesCollide("Player", "player")).toBe(true);
    expect(displayNamesCollide("PLAYER", "PlAyEr")).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(displayNamesCollide(" Player ", "player")).toBe(true);
  });

  it("keeps genuinely different names apart", () => {
    expect(displayNamesCollide("Player", "Player1")).toBe(false);
    expect(displayNamesCollide("a_b", "ab")).toBe(false);
  });
});

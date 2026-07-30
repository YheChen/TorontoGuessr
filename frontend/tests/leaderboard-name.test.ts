import { describe, expect, it } from "vitest";
import {
  MAX_LEADERBOARD_NAME_LENGTH,
  toLeaderboardName,
} from "@/lib/leaderboard-name";

describe("toLeaderboardName", () => {
  it("leaves a name the leaderboard already accepts untouched", () => {
    expect(toLeaderboardName("Yanzhen")).toBe("Yanzhen");
    expect(toLeaderboardName("abc123")).toBe("abc123");
  });

  it("preserves case, because the leaderboard displays it as typed", () => {
    expect(toLeaderboardName("MiXeDcAsE")).toBe("MiXeDcAsE");
  });

  it("strips underscores, which display names allow and the leaderboard does not", () => {
    expect(toLeaderboardName("cool_guy_99")).toBe("coolguy99");
    expect(toLeaderboardName("_leading")).toBe("leading");
  });

  it("truncates to the leaderboard's maximum length", () => {
    // 16 characters is a legal display name and twice what fits here.
    expect(toLeaderboardName("abcdefghijklmnop")).toBe("abcdefghij");
    expect(toLeaderboardName("abcdefghijklmnop")).toHaveLength(
      MAX_LEADERBOARD_NAME_LENGTH
    );
  });

  it("truncates only after stripping, so underscores do not eat the budget", () => {
    // Naive truncate-then-strip would give "abcde" instead of all ten digits.
    expect(toLeaderboardName("a_b_c_d_e_1234567890")).toBe("abcde12345");
  });

  it("returns null when nothing usable is left", () => {
    expect(toLeaderboardName("____")).toBeNull();
    expect(toLeaderboardName("")).toBeNull();
    expect(toLeaderboardName("   ")).toBeNull();
  });

  it("returns null for a missing name rather than throwing", () => {
    expect(toLeaderboardName(null)).toBeNull();
    expect(toLeaderboardName(undefined)).toBeNull();
  });
});

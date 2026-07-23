import { describe, expect, it } from "vitest";
import { buildShareText, tileFor } from "@/lib/share-text";

describe("tileFor", () => {
  it("maps score tiers to emoji tiles", () => {
    expect(tileFor(5000)).toBe("🟩");
    expect(tileFor(4000)).toBe("🟩");
    expect(tileFor(3999)).toBe("🟦");
    expect(tileFor(2000)).toBe("🟦");
    expect(tileFor(1999)).toBe("🟨");
    expect(tileFor(1)).toBe("🟨");
    expect(tileFor(0)).toBe("⬛");
  });
});

describe("buildShareText", () => {
  const scores = [
    { score: 5000 },
    { score: 2500 },
    { score: 0 },
    { score: 1200 },
    { score: 4200 },
  ];

  it("builds a classic summary with heading, total, tiles, and origin", () => {
    const text = buildShareText({
      totalScore: 12900,
      maxScore: 25000,
      scores,
      mode: "classic",
      challengeDate: null,
    });
    expect(text).toBe(
      ["TorontoGuessr", "12,900 / 25,000", "🟩🟦⬛🟨🟩", "https://www.torontoguessr.ca"].join(
        "\n",
      ),
    );
  });

  it("uses the daily challenge heading when in daily mode with a date", () => {
    const text = buildShareText({
      totalScore: 25000,
      maxScore: 25000,
      scores: [{ score: 5000 }],
      mode: "daily",
      challengeDate: "2026-07-15",
    });
    expect(text.split("\n")[0]).toBe(
      "TorontoGuessr Daily Challenge 2026-07-15",
    );
  });

  it("falls back to the plain heading in daily mode without a date", () => {
    const text = buildShareText({
      totalScore: 0,
      maxScore: 25000,
      scores: [],
      mode: "daily",
      challengeDate: null,
    });
    expect(text.split("\n")[0]).toBe("TorontoGuessr");
  });
});

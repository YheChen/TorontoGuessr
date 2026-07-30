import { describe, expect, it } from "vitest";
import {
  guessProgress,
  LOBBY_PLAYER_COLORS,
  lobbyTokenKey,
  playerColor,
  rankPlayers,
  secondsUntil,
} from "@/lib/lobby-client";
import type { LobbyPlayerState } from "@/lib/types";

function player(overrides: Partial<LobbyPlayerState> = {}): LobbyPlayerState {
  return {
    playerId: "p1",
    displayName: "ALEX",
    totalScore: 0,
    isConnected: true,
    hasGuessed: false,
    ...overrides,
  };
}

describe("lobbyTokenKey", () => {
  it("scopes the key per lobby and normalizes case", () => {
    expect(lobbyTokenKey("abc234")).toBe("tg_lobby_token_ABC234");
    expect(lobbyTokenKey("ABC234")).toBe("tg_lobby_token_ABC234");
  });

  it("gives different lobbies different keys", () => {
    expect(lobbyTokenKey("AAA111")).not.toBe(lobbyTokenKey("BBB222"));
  });
});

describe("playerColor", () => {
  it("is stable for a given index", () => {
    expect(playerColor(0)).toBe(playerColor(0));
    expect(playerColor(0)).toBe(LOBBY_PLAYER_COLORS[0]);
  });

  it("gives distinct colours to a full lobby", () => {
    const colors = new Set(
      Array.from({ length: LOBBY_PLAYER_COLORS.length }, (_, i) =>
        playerColor(i)
      )
    );
    expect(colors.size).toBe(LOBBY_PLAYER_COLORS.length);
  });

  it("wraps around beyond the palette", () => {
    expect(playerColor(LOBBY_PLAYER_COLORS.length)).toBe(playerColor(0));
  });

  it("handles a negative index without crashing", () => {
    expect(typeof playerColor(-1)).toBe("string");
  });
});

describe("secondsUntil", () => {
  const serverNow = "2026-07-15T12:00:00.000Z";

  it("counts down from the server clock, not the local one", () => {
    expect(secondsUntil("2026-07-15T12:00:30.000Z", serverNow)).toBe(30);
  });

  it("subtracts time elapsed since the state was fetched", () => {
    expect(secondsUntil("2026-07-15T12:00:30.000Z", serverNow, 10_000)).toBe(20);
  });

  it("never goes negative", () => {
    expect(secondsUntil("2026-07-15T11:59:00.000Z", serverNow)).toBe(0);
  });

  it("returns 0 for a missing or unparseable deadline", () => {
    expect(secondsUntil(null, serverNow)).toBe(0);
    expect(secondsUntil("nope", serverNow)).toBe(0);
    expect(secondsUntil("2026-07-15T12:00:30.000Z", "nope")).toBe(0);
  });
});

describe("rankPlayers", () => {
  it("orders by score descending", () => {
    const ranked = rankPlayers([
      player({ playerId: "a", displayName: "A", totalScore: 100 }),
      player({ playerId: "b", displayName: "B", totalScore: 900 }),
    ]);
    expect(ranked.map((p) => p.playerId)).toEqual(["b", "a"]);
  });

  it("breaks ties by name so the order does not jitter", () => {
    const ranked = rankPlayers([
      player({ playerId: "z", displayName: "ZED", totalScore: 500 }),
      player({ playerId: "a", displayName: "AMY", totalScore: 500 }),
    ]);
    expect(ranked.map((p) => p.displayName)).toEqual(["AMY", "ZED"]);
  });

  it("does not mutate the input", () => {
    const input = [
      player({ playerId: "a", totalScore: 1 }),
      player({ playerId: "b", totalScore: 2 }),
    ];
    rankPlayers(input);
    expect(input.map((p) => p.playerId)).toEqual(["a", "b"]);
  });
});

describe("guessProgress", () => {
  it("counts connected players who have guessed", () => {
    expect(
      guessProgress([
        player({ hasGuessed: true }),
        player({ hasGuessed: false }),
        player({ hasGuessed: true }),
      ])
    ).toEqual({ guessed: 2, total: 3 });
  });

  it("ignores players who have left", () => {
    expect(
      guessProgress([
        player({ hasGuessed: true }),
        player({ hasGuessed: false, isConnected: false }),
      ])
    ).toEqual({ guessed: 1, total: 1 });
  });

  it("falls back to everyone when nobody is connected", () => {
    expect(
      guessProgress([
        player({ hasGuessed: true, isConnected: false }),
        player({ hasGuessed: false, isConnected: false }),
      ])
    ).toEqual({ guessed: 1, total: 2 });
  });

  it("handles an empty lobby", () => {
    expect(guessProgress([])).toEqual({ guessed: 0, total: 0 });
  });
});

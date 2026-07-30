import { describe, expect, it } from "vitest";
import {
  planSettlement,
  REVEAL_DURATION_SECONDS,
  type LobbyTimingState,
} from "../src/lobby-settle.js";

const NOW = Date.parse("2026-07-15T12:00:00.000Z");
const ROUND_LIMIT = 60;

function lobby(overrides: Partial<LobbyTimingState> = {}): LobbyTimingState {
  return {
    status: "in_progress",
    currentRoundIndex: 0,
    totalRounds: 5,
    roundRevealed: false,
    roundDeadlineAt: new Date(NOW + 30_000).toISOString(),
    revealDeadlineAt: null,
    ...overrides,
  };
}

function plan(
  state: LobbyTimingState,
  options: {
    allPlayersGuessed?: boolean;
    hostAdvancing?: boolean;
    now?: number;
  } = {}
) {
  return planSettlement(state, {
    allPlayersGuessed: options.allPlayersGuessed ?? false,
    hostAdvancing: options.hostAdvancing ?? false,
    now: options.now ?? NOW,
    roundTimeLimitSeconds: ROUND_LIMIT,
    revealDurationSeconds: REVEAL_DURATION_SECONDS,
  });
}

describe("planSettlement: nothing to do", () => {
  it("does not progress a lobby that has not started", () => {
    expect(plan(lobby({ status: "waiting" }))).toEqual([]);
  });

  it("does not progress a finished lobby", () => {
    expect(plan(lobby({ status: "finished" }))).toEqual([]);
  });

  it("waits while the round clock is still running and someone is out", () => {
    expect(plan(lobby(), { allPlayersGuessed: false })).toEqual([]);
  });

  it("waits while the reveal is still on screen", () => {
    const state = lobby({
      roundRevealed: true,
      revealDeadlineAt: new Date(NOW + 5_000).toISOString(),
    });
    expect(plan(state)).toEqual([]);
  });
});

describe("planSettlement: revealing a round", () => {
  it("reveals as soon as every player has answered", () => {
    const steps = plan(lobby(), { allPlayersGuessed: true });
    expect(steps).toEqual([
      {
        type: "reveal",
        roundIndex: 0,
        revealDeadlineAt: new Date(
          NOW + REVEAL_DURATION_SECONDS * 1000
        ).toISOString(),
      },
    ]);
  });

  it("reveals when the round deadline passes even if players are missing", () => {
    const state = lobby({
      roundDeadlineAt: new Date(NOW - 1_000).toISOString(),
    });
    const steps = plan(state, { allPlayersGuessed: false });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: "reveal", roundIndex: 0 });
  });

  it("reveals the round the lobby is actually on", () => {
    const state = lobby({
      currentRoundIndex: 3,
      roundDeadlineAt: new Date(NOW - 1).toISOString(),
    });
    expect(steps0(plan(state))).toMatchObject({
      type: "reveal",
      roundIndex: 3,
    });
  });

  it("treats a missing round deadline as expired rather than blocking", () => {
    const steps = plan(lobby({ roundDeadlineAt: null }));
    expect(steps0(steps)).toMatchObject({ type: "reveal" });
  });

  it("treats an unparseable deadline as expired", () => {
    const steps = plan(lobby({ roundDeadlineAt: "not-a-date" }));
    expect(steps0(steps)).toMatchObject({ type: "reveal" });
  });
});

describe("planSettlement: advancing past the reveal", () => {
  const revealed = (extra: Partial<LobbyTimingState> = {}) =>
    lobby({
      roundRevealed: true,
      revealDeadlineAt: new Date(NOW - 1).toISOString(),
      ...extra,
    });

  it("advances to the next round when the reveal expires", () => {
    const steps = plan(revealed());
    expect(steps).toEqual([
      {
        type: "advance",
        nextRoundIndex: 1,
        roundStartedAt: new Date(NOW).toISOString(),
        roundDeadlineAt: new Date(NOW + ROUND_LIMIT * 1000).toISOString(),
      },
    ]);
  });

  it("lets the host skip a reveal that has not expired yet", () => {
    const state = lobby({
      roundRevealed: true,
      revealDeadlineAt: new Date(NOW + 10_000).toISOString(),
    });
    expect(plan(state, { hostAdvancing: true })).toEqual([
      {
        type: "advance",
        nextRoundIndex: 1,
        roundStartedAt: new Date(NOW).toISOString(),
        roundDeadlineAt: new Date(NOW + ROUND_LIMIT * 1000).toISOString(),
      },
    ]);
  });

  it("does not let the host skip the guessing phase", () => {
    // hostAdvancing only applies to the reveal; a live round still needs
    // consensus or its deadline.
    expect(plan(lobby(), { hostAdvancing: true })).toEqual([]);
  });

  it("finishes instead of advancing past the last round", () => {
    const steps = plan(revealed({ currentRoundIndex: 4, totalRounds: 5 }));
    expect(steps).toEqual([{ type: "finish" }]);
  });

  it("stops after advancing, since a fresh round cannot be complete", () => {
    const steps = plan(revealed(), { allPlayersGuessed: true });
    expect(steps).toHaveLength(1);
    expect(steps0(steps).type).toBe("advance");
  });
});

describe("planSettlement: a reveal always gets its full duration", () => {
  // A long-abandoned round is revealed from `now`, not fast-forwarded, so a
  // player returning to a stale lobby still sees the reveal instead of the
  // lobby jumping several rounds ahead. Each call therefore plans one
  // transition, because every transition sets a fresh future deadline.
  it("reveals without advancing even when the round expired long ago", () => {
    const state = lobby({
      currentRoundIndex: 1,
      roundDeadlineAt: new Date(NOW - 60_000).toISOString(),
    });
    const steps = plan(state);
    expect(steps.map((step) => step.type)).toEqual(["reveal"]);
    expect(steps[0]).toMatchObject({
      roundIndex: 1,
      revealDeadlineAt: new Date(
        NOW + REVEAL_DURATION_SECONDS * 1000
      ).toISOString(),
    });
  });

  it("reveals the final round rather than finishing immediately", () => {
    const state = lobby({
      currentRoundIndex: 4,
      totalRounds: 5,
      roundDeadlineAt: new Date(NOW - 60_000).toISOString(),
    });
    expect(plan(state).map((step) => step.type)).toEqual(["reveal"]);
  });

  it("finishes on the next call, once that reveal has expired", () => {
    const state = lobby({
      currentRoundIndex: 4,
      totalRounds: 5,
      roundRevealed: true,
      revealDeadlineAt: new Date(NOW - 1).toISOString(),
    });
    expect(plan(state)).toEqual([{ type: "finish" }]);
  });

  it("only reveals once when everyone answers on the last round", () => {
    const state = lobby({ currentRoundIndex: 4, totalRounds: 5 });
    const steps = plan(state, { allPlayersGuessed: true });
    // The reveal still gets its full duration before the game ends.
    expect(steps.map((step) => step.type)).toEqual(["reveal"]);
  });

  it("handles a single-round lobby", () => {
    const state = lobby({
      currentRoundIndex: 0,
      totalRounds: 1,
      roundRevealed: true,
      revealDeadlineAt: new Date(NOW - 1).toISOString(),
    });
    expect(plan(state)).toEqual([{ type: "finish" }]);
  });

  it("never plans more steps than the lobby has rounds", () => {
    const state = lobby({
      currentRoundIndex: 0,
      totalRounds: 5,
      roundDeadlineAt: new Date(NOW - 10 * 60_000).toISOString(),
    });
    expect(plan(state).length).toBeLessThanOrEqual(2);
  });
});

function steps0<T>(steps: T[]): T {
  const first = steps[0];
  if (!first) {
    throw new Error("expected at least one settlement step");
  }
  return first;
}

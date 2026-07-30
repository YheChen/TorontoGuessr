/**
 * Pure lobby round progression.
 *
 * The backend is stateless, so nothing is running between requests to end a
 * round. Instead every request asks this planner what should already have
 * happened, and the store applies the resulting steps. Keeping the decision
 * pure means the tricky part (deadlines, host-or-timeout advancement, the last
 * round) is unit testable without a database.
 */

import type { LobbyStatus } from "./types.js";

export type { LobbyStatus };

export interface LobbyTimingState {
  status: LobbyStatus;
  currentRoundIndex: number;
  totalRounds: number;
  /** True once the round is scored and players are looking at the reveal. */
  roundRevealed: boolean;
  /** When the current round stops accepting guesses. */
  roundDeadlineAt: string | null;
  /** When the reveal auto-advances if the host has not already. */
  revealDeadlineAt: string | null;
}

export interface SettleOptions {
  /** Every still-connected player has answered the current round. */
  allPlayersGuessed: boolean;
  /** The host asked to move on, skipping the rest of the reveal. */
  hostAdvancing?: boolean;
  now: number;
  roundTimeLimitSeconds: number;
  revealDurationSeconds: number;
}

export type SettleStep =
  | {
      type: "reveal";
      /** The round being scored; absent guesses become timeouts. */
      roundIndex: number;
      revealDeadlineAt: string;
    }
  | {
      type: "advance";
      nextRoundIndex: number;
      roundStartedAt: string;
      roundDeadlineAt: string;
    }
  | { type: "finish" };

/** How long players get to look at a round reveal before it auto-advances. */
export const REVEAL_DURATION_SECONDS = 15;

/** Treats a missing deadline as already expired: an unset clock cannot block. */
function deadlinePassed(deadline: string | null, now: number): boolean {
  if (!deadline) {
    return true;
  }
  const parsed = Date.parse(deadline);
  return Number.isNaN(parsed) ? true : now >= parsed;
}

function toIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/**
 * The steps needed to bring a lobby up to date, in order.
 *
 * An empty array means the lobby is already current. In practice a single
 * transition is planned per call, because each transition sets a fresh
 * deadline in the future: revealing a round gives players the full reveal
 * duration measured from now, and advancing gives the new round its full
 * timer. A round abandoned long ago is therefore revealed rather than
 * fast-forwarded, so a player returning to a stale lobby still sees the
 * reveal instead of the lobby jumping several rounds ahead.
 */
export function planSettlement(
  lobby: LobbyTimingState,
  {
    allPlayersGuessed,
    hostAdvancing = false,
    now,
    roundTimeLimitSeconds,
    revealDurationSeconds = REVEAL_DURATION_SECONDS,
  }: SettleOptions
): SettleStep[] {
  const steps: SettleStep[] = [];

  // Lobbies that have not started, or are already over, never progress.
  if (lobby.status !== "in_progress") {
    return steps;
  }

  let roundIndex = lobby.currentRoundIndex;
  let revealed = lobby.roundRevealed;
  let roundDeadlineAt = lobby.roundDeadlineAt;
  let revealDeadlineAt = lobby.revealDeadlineAt;

  // Bounded walk; in practice this runs at most twice.
  for (let guard = 0; guard <= lobby.totalRounds * 2 + 2; guard += 1) {
    if (!revealed) {
      // Only the round the caller reported on can be complete by consensus.
      // Any later round reached in this walk has just begun.
      const everyoneAnswered = steps.length === 0 && allPlayersGuessed;
      if (!everyoneAnswered && !deadlinePassed(roundDeadlineAt, now)) {
        break;
      }

      const nextRevealDeadline = toIso(now + revealDurationSeconds * 1000);
      steps.push({
        type: "reveal",
        roundIndex,
        revealDeadlineAt: nextRevealDeadline,
      });
      revealed = true;
      revealDeadlineAt = nextRevealDeadline;
      continue;
    }

    // Reveal is showing: the host may skip it, otherwise it expires on its own.
    const hostSkipping = hostAdvancing && steps.length === 0;
    if (!hostSkipping && !deadlinePassed(revealDeadlineAt, now)) {
      break;
    }

    const nextRoundIndex = roundIndex + 1;
    if (nextRoundIndex >= lobby.totalRounds) {
      steps.push({ type: "finish" });
      break;
    }

    const startedAt = toIso(now);
    const nextRoundDeadline = toIso(now + roundTimeLimitSeconds * 1000);
    steps.push({
      type: "advance",
      nextRoundIndex,
      roundStartedAt: startedAt,
      roundDeadlineAt: nextRoundDeadline,
    });
    roundIndex = nextRoundIndex;
    revealed = false;
    roundDeadlineAt = nextRoundDeadline;
    revealDeadlineAt = null;
  }

  return steps;
}

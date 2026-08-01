import { createHash, randomUUID } from "node:crypto";
import { calculateDistance, calculateScore } from "./scoring-service.js";
import {
  deleteRows,
  insertRow,
  selectRows,
  selectSingleRow,
  updateSingleRow,
} from "./supabase.js";
import { generateShortCode } from "./short-code.js";
import { createHttpError } from "./http-utils.js";
import { sanitizeUsername } from "./username-utils.js";
import { selectGameRounds } from "./services/location-service.js";
import {
  planSettlement,
  REVEAL_DURATION_SECONDS,
  type LobbyTimingState,
} from "./lobby-settle.js";
import { broadcastLobbyChange } from "./realtime.js";
import type {
  LatLng,
  LobbyPlayerRecord,
  LobbyPlayerResult,
  LobbyRecord,
} from "./types.js";

const LOBBIES_TABLE = "lobbies";
const LOBBY_PLAYERS_TABLE = "lobby_players";
const LOBBY_COLUMNS =
  "id,join_code,status,host_player_id,rounds,total_rounds,current_round_index,round_time_limit_seconds,round_started_at,round_deadline_at,round_revealed,reveal_deadline_at,created_at,updated_at,expires_at";
// player_token_hash is deliberately excluded: it authenticates a player and
// must never reach a response payload.
const PLAYER_COLUMNS =
  "id,lobby_id,display_name,total_score,results,is_connected,last_seen_at,joined_at";
const PLAYER_COLUMNS_WITH_TOKEN = `${PLAYER_COLUMNS},player_token_hash`;

export const LOBBY_ROUNDS = 5;
export const LOBBY_MAX_PLAYERS = 8;
export const LOBBY_ROUND_TIME_LIMIT_SECONDS = 60;
const LOBBY_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

// Flips to false when the lobby tables are missing (migration not applied
// yet). Multiplayer then reports as unavailable and nothing else changes.
let lobbyTablesAvailable = true;
let hasWarnedAboutMissingTables = false;

function isMissingTableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /relation .* does not exist|could not find the table|does not exist in the schema/i.test(
      error.message
    )
  );
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /duplicate key|already exists|unique constraint/i.test(error.message)
  );
}

function markTablesMissing(): never {
  lobbyTablesAvailable = false;
  if (!hasWarnedAboutMissingTables) {
    hasWarnedAboutMissingTables = true;
    console.warn(
      "[lobby-store] lobby tables missing; run add_multiplayer_lobbies.sql. Multiplayer is disabled until then."
    );
  }
  throw unavailableError();
}

function unavailableError(): Error {
  return createHttpError(
    503,
    "Multiplayer is not available yet. Please try again later."
  );
}

function requireAvailable(): void {
  if (!lobbyTablesAvailable) {
    throw unavailableError();
  }
}

/** Runs a lobby query, converting a missing-table error into a 503. */
async function guarded<T>(operation: () => Promise<T>): Promise<T> {
  requireAvailable();
  try {
    return await operation();
  } catch (error) {
    if (isMissingTableError(error)) {
      markTablesMissing();
    }
    throw error;
  }
}

/**
 * Tokens are stored hashed so a leaked row cannot be replayed as a
 * credential, and are never echoed back in a payload.
 */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function resultForRound(
  player: LobbyPlayerRecord,
  roundIndex: number
): LobbyPlayerResult | null {
  const results = Array.isArray(player.results) ? player.results : [];
  return results.find((entry) => entry.roundNumber === roundIndex + 1) ?? null;
}

function toTimingState(lobby: LobbyRecord): LobbyTimingState {
  return {
    status: lobby.status,
    currentRoundIndex: lobby.current_round_index,
    totalRounds: lobby.total_rounds,
    roundRevealed: lobby.round_revealed,
    roundDeadlineAt: lobby.round_deadline_at,
    revealDeadlineAt: lobby.reveal_deadline_at,
  };
}

async function fetchLobbyByCode(joinCode: string): Promise<LobbyRecord> {
  const lobby = await guarded(() =>
    selectSingleRow<LobbyRecord>(LOBBIES_TABLE, {
      columns: LOBBY_COLUMNS,
      filters: { join_code: joinCode },
    })
  );

  if (!lobby) {
    throw createHttpError(404, "That lobby could not be found.");
  }

  return lobby;
}

async function fetchPlayers(lobbyId: string): Promise<LobbyPlayerRecord[]> {
  return guarded(() =>
    selectRows<LobbyPlayerRecord>(LOBBY_PLAYERS_TABLE, {
      columns: PLAYER_COLUMNS_WITH_TOKEN,
      filters: { lobby_id: lobbyId },
      order: "joined_at.asc",
      limit: LOBBY_MAX_PLAYERS,
    })
  );
}

function findViewer(
  players: LobbyPlayerRecord[],
  playerToken: string | null
): LobbyPlayerRecord | null {
  if (!playerToken) {
    return null;
  }
  const hash = hashToken(playerToken);
  return players.find((player) => player.player_token_hash === hash) ?? null;
}

/** Best effort removal of long-abandoned lobbies; never blocks a request. */
async function pruneExpiredLobbies(): Promise<void> {
  try {
    await deleteRows(LOBBIES_TABLE, {
      columns: "id",
      filters: { expires_at: { op: "lt", value: new Date().toISOString() } },
    });
  } catch {
    // Cleanup is opportunistic: a failure here must not fail the caller.
  }
}

export async function createLobby(displayName: string): Promise<{
  joinCode: string;
  playerId: string;
  playerToken: string;
}> {
  requireAvailable();
  void pruneExpiredLobbies();

  const hostPlayerId = randomUUID();
  const playerToken = randomUUID();
  const now = Date.now();

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateShortCode();
    try {
      const lobby = await insertRow<LobbyRecord>(
        LOBBIES_TABLE,
        {
          id: randomUUID(),
          join_code: joinCode,
          status: "waiting",
          host_player_id: hostPlayerId,
          rounds: [],
          total_rounds: LOBBY_ROUNDS,
          current_round_index: 0,
          round_time_limit_seconds: LOBBY_ROUND_TIME_LIMIT_SECONDS,
          round_revealed: false,
          expires_at: new Date(now + LOBBY_TTL_MS).toISOString(),
        },
        { columns: LOBBY_COLUMNS }
      );

      await insertRow<LobbyPlayerRecord>(
        LOBBY_PLAYERS_TABLE,
        {
          id: hostPlayerId,
          lobby_id: lobby.id,
          player_token_hash: hashToken(playerToken),
          display_name: sanitizeUsername(displayName),
        },
        { columns: PLAYER_COLUMNS }
      );

      return { joinCode: lobby.join_code, playerId: hostPlayerId, playerToken };
    } catch (error) {
      if (isMissingTableError(error)) {
        markTablesMissing();
      }
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
      // Join code already taken; try another.
    }
  }

  throw createHttpError(
    500,
    "Could not allocate a lobby code. Please try again."
  );
}

export async function joinLobby(
  joinCode: string,
  displayName: string
): Promise<{ playerId: string; playerToken: string }> {
  const lobby = await fetchLobbyByCode(joinCode);

  if (lobby.status !== "waiting") {
    throw createHttpError(409, "That lobby has already started.");
  }

  const players = await fetchPlayers(lobby.id);
  if (players.length >= LOBBY_MAX_PLAYERS) {
    throw createHttpError(409, "That lobby is full.");
  }

  const playerId = randomUUID();
  const playerToken = randomUUID();

  await guarded(() =>
    insertRow<LobbyPlayerRecord>(
      LOBBY_PLAYERS_TABLE,
      {
        id: playerId,
        lobby_id: lobby.id,
        player_token_hash: hashToken(playerToken),
        display_name: sanitizeUsername(displayName),
      },
      { columns: PLAYER_COLUMNS }
    )
  );

  // Let the waiting room show the new player without waiting for a poll.
  await broadcastLobbyChange(lobby.join_code, "join");
  return { playerId, playerToken };
}

/**
 * How long a host may go silent before the role moves to someone else.
 *
 * Generous on purpose. Every player's page polls every 2 seconds, or 10 when the
 * push socket is carrying changes, so 90 seconds of silence is a strong signal
 * rather than a slow network. It also has to survive a BACKGROUNDED TAB: mobile
 * browsers throttle timers hard, and taking the host role away from someone who
 * glanced at another app for a moment would be its own bug.
 */
const HOST_ABSENCE_MS = 90_000;

/** Whether a player looks like they are still at the keyboard. */
function isPresent(player: LobbyPlayerRecord, now: number): boolean {
  // is_connected alone is not enough. It is only set false by an explicit leave,
  // and closing a tab sends nothing, so a departed host stays "connected" forever
  // with a last_seen_at that stops moving. The staleness check is the real signal
  // and the flag is the fast path.
  if (!player.is_connected) {
    return false;
  }
  const seen = Date.parse(player.last_seen_at);
  return Number.isFinite(seen) && now - seen <= HOST_ABSENCE_MS;
}

/**
 * Hand the host role on when the host is gone.
 *
 * WHY THIS IS NEEDED. host_player_id was fixed for the life of the lobby, and it
 * gates three things: starting the game, advancing a reveal early, and starting
 * another game. So a host who closed their tab left a lobby that could never be
 * started and never be replayed, with no way for anyone still sitting in it to fix
 * that. A game already running was the one safe case, because the reveal deadline
 * auto-advances, which is why this was survivable at all.
 *
 * The successor is the longest-present player, which is both fair and, more
 * importantly, DETERMINISTIC: every caller computes the same answer. That is what
 * makes the race harmless. Several players poll at once, all of them may notice the
 * host is gone, and all of them try to promote the same person. The optimistic
 * filter on host_player_id means exactly one write lands and the rest match nothing
 * and simply re-read.
 *
 * Returns the lobby to carry on with, updated or not.
 */
async function migrateHostIfAbsent(
  lobby: LobbyRecord,
  players: LobbyPlayerRecord[]
): Promise<LobbyRecord> {
  const now = Date.now();
  const host = players.find((player) => player.id === lobby.host_player_id);
  if (host && isPresent(host, now)) {
    return lobby;
  }

  const successor = players
    .filter((player) => player.id !== lobby.host_player_id && isPresent(player, now))
    .sort((a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at))[0];

  // Nobody left to promote. Left alone rather than handed to an absent player,
  // so that whoever comes back first can be promoted then.
  if (!successor) {
    return lobby;
  }

  const updated = await guarded(() =>
    updateSingleRow<LobbyRecord>(
      LOBBIES_TABLE,
      { host_player_id: successor.id, updated_at: new Date().toISOString() },
      {
        filters: { id: lobby.id, host_player_id: lobby.host_player_id },
        columns: LOBBY_COLUMNS,
      }
    )
  );

  if (!updated) {
    // Another request promoted first. It computed the same successor, so the lobby
    // is already in the state this one wanted, but the copy in hand still names the
    // host it just found absent. Re-read, so a loser of the race does not serve a
    // stale hostPlayerId for one response and leave the new host without controls
    // until their next poll. One extra query, only on the rare racing path.
    return fetchLobbyByCode(lobby.join_code);
  }

  await broadcastLobbyChange(lobby.join_code, "host");
  return updated;
}

export async function startLobby(
  joinCode: string,
  playerToken: string
): Promise<LobbyStatePayload> {
  const fetched = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(fetched.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    throw createHttpError(403, "You are not in this lobby.");
  }

  // Before the host check, not after. A poll would normally have promoted someone
  // already, but a player who clicks Start the instant they notice the host is gone
  // should not be told they are not the host of a lobby that has none.
  const lobby = await migrateHostIfAbsent(fetched, players);

  if (viewer.id !== lobby.host_player_id) {
    throw createHttpError(403, "Only the host can start the game.");
  }
  if (lobby.status !== "waiting") {
    throw createHttpError(409, "That lobby has already started.");
  }

  const rounds = await selectGameRounds(LOBBY_ROUNDS, null);
  const now = Date.now();

  // Guarded so two start requests cannot both deal rounds.
  const started = await guarded(() =>
    updateSingleRow<LobbyRecord>(
      LOBBIES_TABLE,
      {
        rounds,
        status: "in_progress",
        total_rounds: rounds.length,
        current_round_index: 0,
        round_revealed: false,
        round_started_at: new Date(now).toISOString(),
        round_deadline_at: new Date(
          now + lobby.round_time_limit_seconds * 1000
        ).toISOString(),
        reveal_deadline_at: null,
        updated_at: new Date(now).toISOString(),
      },
      {
        filters: { id: lobby.id, status: "waiting" },
        columns: LOBBY_COLUMNS,
      }
    )
  );

  if (!started) {
    // Lost the race; serve whatever the winner established.
    return getLobbyState(joinCode, playerToken);
  }

  await broadcastLobbyChange(joinCode, "start");
  return buildStatePayload(started, players, viewer);
}

/**
 * Start a fresh game with the players already here.
 *
 * The point is that nobody re-joins. A new lobby means a new code, the host
 * reading it out, and everyone typing it again, which is enough friction that a
 * group who wanted one more round often just stops. This keeps the code, the
 * players and their seats, and resets everything that belongs to a single game.
 *
 * Deliberately NOT a new lobby row. Reusing this one is what preserves the
 * player rows, and with them each player's token, so no client has to
 * re-authenticate or be told anything new.
 *
 * SCORES ARE CLEARED, INCLUDING FOR DISCONNECTED PLAYERS. A player whose tab is
 * still open rejoins the new game automatically; one who closed it leaves a reset
 * row behind, which is harmless and is also what makes their return clean if they
 * come back. Nothing preserves the previous game's scores: the final scoreboard
 * has already been shown, and keeping stale totals visible next to a fresh game
 * would be worse than losing them.
 */
export async function rematchLobby(
  joinCode: string,
  playerToken: string
): Promise<LobbyStatePayload> {
  const fetched = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(fetched.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    throw createHttpError(403, "You are not in this lobby.");
  }

  // Same reasoning as startLobby: a finished lobby whose host closed their tab was
  // the other permanent dead end, since nobody else could ever press Play again.
  const lobby = await migrateHostIfAbsent(fetched, players);

  if (viewer.id !== lobby.host_player_id) {
    throw createHttpError(403, "Only the host can start another game.");
  }
  if (lobby.status !== "finished") {
    throw createHttpError(409, "That game is still in progress.");
  }

  const rounds = await selectGameRounds(LOBBY_ROUNDS, null);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  // The lobby row first, guarded on status='finished' so two rematch requests
  // cannot both deal rounds. Same shape as the guard in startLobby.
  //
  // Order matters: if this claims the rematch and the player reset below then
  // fails, the game is playable with stale totals, which is recoverable. Doing it
  // the other way round could wipe the scoreboard while leaving the lobby
  // finished, which shows a table of zeroes as the final result.
  const restarted = await guarded(() =>
    updateSingleRow<LobbyRecord>(
      LOBBIES_TABLE,
      {
        rounds,
        status: "in_progress",
        total_rounds: rounds.length,
        current_round_index: 0,
        round_revealed: false,
        round_started_at: nowIso,
        round_deadline_at: new Date(
          now + lobby.round_time_limit_seconds * 1000
        ).toISOString(),
        reveal_deadline_at: null,
        updated_at: nowIso,
        // A finished lobby is close to its six-hour expiry by the time anyone asks
        // for a rematch, and the reaper deletes on expires_at. Without this the
        // new game could be swept out from under the players mid-round.
        expires_at: new Date(now + LOBBY_TTL_MS).toISOString(),
      },
      {
        filters: { id: lobby.id, status: "finished" },
        columns: LOBBY_COLUMNS,
      }
    )
  );

  if (!restarted) {
    // Lost the race; serve whatever the winner established.
    return getLobbyState(joinCode, playerToken);
  }

  const resetPlayers = await Promise.all(
    players.map(async (player) => {
      const updated = await guarded(() =>
        updateSingleRow<LobbyPlayerRecord>(
          LOBBY_PLAYERS_TABLE,
          { total_score: 0, results: [], last_seen_at: nowIso },
          { filters: { id: player.id }, columns: PLAYER_COLUMNS_WITH_TOKEN }
        )
      );
      // The token hash is carried over rather than re-read: PLAYER_COLUMNS omits
      // it everywhere else, and findViewer below needs it to identify the caller.
      return updated
        ? { ...updated, player_token_hash: player.player_token_hash }
        : { ...player, total_score: 0, results: [] };
    })
  );

  await broadcastLobbyChange(joinCode, "rematch");
  return buildStatePayload(
    restarted,
    resetPlayers,
    findViewer(resetPlayers, playerToken)
  );
}

export async function submitLobbyGuess(
  joinCode: string,
  playerToken: string,
  guessLocation: LatLng | null
): Promise<LobbyStatePayload> {
  const lobby = await fetchLobbyByCode(joinCode);
  let players = await fetchPlayers(lobby.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    throw createHttpError(403, "You are not in this lobby.");
  }

  // Settle first: the round may already be over.
  const settled = await settleLobby(lobby, players);
  if (settled.lobby.status !== "in_progress" || settled.lobby.round_revealed) {
    throw createHttpError(409, "That round has already closed.");
  }

  players = settled.players;
  const roundIndex = settled.lobby.current_round_index;
  const round = (settled.lobby.rounds ?? [])[roundIndex];
  if (!round) {
    throw createHttpError(409, "That lobby has no active round.");
  }
  if (resultForRound(viewer, roundIndex)) {
    throw createHttpError(409, "You have already guessed this round.");
  }

  const distance = guessLocation
    ? calculateDistance(
        guessLocation.lat,
        guessLocation.lng,
        round.lat,
        round.lng
      )
    : null;
  const result: LobbyPlayerResult = {
    roundNumber: roundIndex + 1,
    score: distance === null ? 0 : calculateScore(distance),
    distance,
    guessLocation,
  };

  // Only `results` is written here. The running total is recomputed when the
  // round is revealed, so a live score cannot leak how well someone just did.
  const existingResults = Array.isArray(viewer.results) ? viewer.results : [];
  await guarded(() =>
    updateSingleRow<LobbyPlayerRecord>(
      LOBBY_PLAYERS_TABLE,
      {
        results: [...existingResults, result],
        is_connected: true,
        last_seen_at: new Date().toISOString(),
      },
      { filters: { id: viewer.id }, columns: PLAYER_COLUMNS }
    )
  );

  // Re-read and settle again: this guess may have completed the round.
  const refreshedPlayers = await fetchPlayers(settled.lobby.id);
  const after = await settleLobby(settled.lobby, refreshedPlayers);

  // Others should see "locked in" (and any resulting reveal) immediately.
  await broadcastLobbyChange(joinCode, "guess");
  return buildStatePayload(
    after.lobby,
    after.players,
    findViewer(after.players, playerToken)
  );
}

/**
 * Advance past the reveal. The host can do this early; everyone else just
 * gets the current state, which auto-advances once the reveal expires.
 */
export async function advanceLobby(
  joinCode: string,
  playerToken: string
): Promise<LobbyStatePayload> {
  const fetched = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(fetched.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    throw createHttpError(403, "You are not in this lobby.");
  }

  // So the new host can skip a reveal early rather than everyone waiting out the
  // timer. A running game never stalled without this, since the reveal deadline
  // auto-advances, but it did lose the one control that made it feel responsive.
  const lobby = await migrateHostIfAbsent(fetched, players);

  const settled = await settleLobby(lobby, players, {
    hostAdvancing: viewer.id === lobby.host_player_id,
  });
  return buildStatePayload(
    settled.lobby,
    settled.players,
    findViewer(settled.players, playerToken)
  );
}

export async function leaveLobby(
  joinCode: string,
  playerToken: string
): Promise<{ left: boolean }> {
  const lobby = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(lobby.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    return { left: false };
  }

  await guarded(() =>
    updateSingleRow<LobbyPlayerRecord>(
      LOBBY_PLAYERS_TABLE,
      { is_connected: false, last_seen_at: new Date().toISOString() },
      { filters: { id: viewer.id }, columns: PLAYER_COLUMNS }
    )
  );

  // Leaving can complete a round, since absent players stop being awaited.
  await broadcastLobbyChange(joinCode, "leave");
  return { left: true };
}

export async function getLobbyState(
  joinCode: string,
  playerToken: string | null
): Promise<LobbyStatePayload> {
  const lobby = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(lobby.id);
  const viewer = findViewer(players, playerToken);

  if (viewer) {
    const seenAt = new Date().toISOString();
    // Touch presence so "who is still here" stays roughly accurate.
    void guarded(() =>
      updateSingleRow<LobbyPlayerRecord>(
        LOBBY_PLAYERS_TABLE,
        { is_connected: true, last_seen_at: seenAt },
        { filters: { id: viewer.id }, columns: "id" }
      )
    ).catch(() => undefined);

    // Reflected in the array too, because migrateHostIfAbsent below reads it. The
    // write above is fire-and-forget, so without this the caller is judged on a
    // last_seen_at from their PREVIOUS poll: a player returning after a couple of
    // minutes would be treated as absent on the very request that proves they are
    // not, and so skipped as a successor. Whoever is making this request is present
    // by definition, whether or not the write lands.
    viewer.is_connected = true;
    viewer.last_seen_at = seenAt;
  }

  // The main path. Every player's page polls this every couple of seconds, so an
  // absent host is noticed and replaced without anyone having to do anything.
  const withHost = await migrateHostIfAbsent(lobby, players);

  const settled = await settleLobby(withHost, players);
  return buildStatePayload(
    settled.lobby,
    settled.players,
    findViewer(settled.players, playerToken)
  );
}

/**
 * Bring a lobby up to date. Idempotent and safe to run concurrently: each
 * transition is written with an optimistic filter, so simultaneous callers
 * race harmlessly and the loser simply re-reads.
 */
async function settleLobby(
  lobby: LobbyRecord,
  players: LobbyPlayerRecord[],
  { hostAdvancing = false }: { hostAdvancing?: boolean } = {}
): Promise<{ lobby: LobbyRecord; players: LobbyPlayerRecord[] }> {
  const roundIndex = lobby.current_round_index;
  const active = players.filter((player) => player.is_connected);
  const answered = (active.length > 0 ? active : players).every((player) =>
    resultForRound(player, roundIndex)
  );

  const steps = planSettlement(toTimingState(lobby), {
    allPlayersGuessed: players.length > 0 && answered,
    hostAdvancing,
    now: Date.now(),
    roundTimeLimitSeconds: lobby.round_time_limit_seconds,
    revealDurationSeconds: REVEAL_DURATION_SECONDS,
  });

  if (steps.length === 0) {
    return { lobby, players };
  }

  let currentLobby = lobby;
  let currentPlayers = players;
  // A settle can be triggered by any client's poll, so when it transitions the
  // lobby every other client needs to hear about it, not just this caller.
  let transitioned = false;

  for (const step of steps) {
    if (step.type === "reveal") {
      // Fill in timeouts, then recompute totals from results so the write is
      // idempotent even if two requests reveal at once.
      currentPlayers = await Promise.all(
        currentPlayers.map(async (player) => {
          const existing = Array.isArray(player.results) ? player.results : [];
          const results = resultForRound(player, step.roundIndex)
            ? existing
            : [
                ...existing,
                {
                  roundNumber: step.roundIndex + 1,
                  score: 0,
                  distance: null,
                  guessLocation: null,
                } satisfies LobbyPlayerResult,
              ];
          const totalScore = results.reduce(
            (sum, entry) => sum + entry.score,
            0
          );
          const updated = await guarded(() =>
            updateSingleRow<LobbyPlayerRecord>(
              LOBBY_PLAYERS_TABLE,
              { results, total_score: totalScore },
              { filters: { id: player.id }, columns: PLAYER_COLUMNS_WITH_TOKEN }
            )
          );
          return updated
            ? { ...updated, player_token_hash: player.player_token_hash }
            : { ...player, results, total_score: totalScore };
        })
      );

      const revealed = await guarded(() =>
        updateSingleRow<LobbyRecord>(
          LOBBIES_TABLE,
          {
            round_revealed: true,
            reveal_deadline_at: step.revealDeadlineAt,
            updated_at: new Date().toISOString(),
          },
          {
            filters: {
              id: currentLobby.id,
              current_round_index: step.roundIndex,
              round_revealed: false,
            },
            columns: LOBBY_COLUMNS,
          }
        )
      );
      if (!revealed) {
        // Another request revealed first; adopt their state.
        return {
          lobby: await fetchLobbyByCode(currentLobby.join_code),
          players: await fetchPlayers(currentLobby.id),
        };
      }
      currentLobby = revealed;
      transitioned = true;
      continue;
    }

    if (step.type === "advance") {
      const advanced = await guarded(() =>
        updateSingleRow<LobbyRecord>(
          LOBBIES_TABLE,
          {
            current_round_index: step.nextRoundIndex,
            round_revealed: false,
            round_started_at: step.roundStartedAt,
            round_deadline_at: step.roundDeadlineAt,
            reveal_deadline_at: null,
            updated_at: new Date().toISOString(),
          },
          {
            filters: {
              id: currentLobby.id,
              current_round_index: step.nextRoundIndex - 1,
              round_revealed: true,
            },
            columns: LOBBY_COLUMNS,
          }
        )
      );
      if (!advanced) {
        return {
          lobby: await fetchLobbyByCode(currentLobby.join_code),
          players: await fetchPlayers(currentLobby.id),
        };
      }
      currentLobby = advanced;
      transitioned = true;
      continue;
    }

    const finished = await guarded(() =>
      updateSingleRow<LobbyRecord>(
        LOBBIES_TABLE,
        { status: "finished", updated_at: new Date().toISOString() },
        {
          filters: { id: currentLobby.id, status: "in_progress" },
          columns: LOBBY_COLUMNS,
        }
      )
    );
    if (finished) {
      currentLobby = finished;
      transitioned = true;
    }
  }

  if (transitioned) {
    await broadcastLobbyChange(currentLobby.join_code, "settle");
  }

  return { lobby: currentLobby, players: currentPlayers };
}

export interface LobbyStatePayload {
  joinCode: string;
  status: LobbyRecord["status"];
  hostPlayerId: string;
  currentRound: number;
  totalRounds: number;
  roundRevealed: boolean;
  timeLimit: number;
  roundDeadlineAt: string | null;
  revealDeadlineAt: string | null;
  /** Lets clients render a countdown without trusting their own clock. */
  serverTime: string;
  round: {
    panoId: string;
    heading: number;
    pitch: number;
    zoom: number;
  } | null;
  actualLocation: LatLng | null;
  you: {
    playerId: string;
    isHost: boolean;
    hasGuessed: boolean;
  } | null;
  players: Array<{
    playerId: string;
    displayName: string;
    totalScore: number;
    isConnected: boolean;
    hasGuessed: boolean;
    roundScore?: number;
    roundDistance?: number | null;
    guessLocation?: LatLng | null;
  }>;
}

/**
 * The client-facing view of a lobby.
 *
 * This is the anti-cheat boundary. Before a round is revealed the payload says
 * *who* has locked in a guess but never *where*, and never the answer; the
 * round's coordinates and everyone's pins appear only once it is revealed.
 */
function buildStatePayload(
  lobby: LobbyRecord,
  players: LobbyPlayerRecord[],
  viewer: LobbyPlayerRecord | null
): LobbyStatePayload {
  const roundIndex = lobby.current_round_index;
  const round = (lobby.rounds ?? [])[roundIndex] ?? null;
  const playing = lobby.status === "in_progress";
  const revealed = playing && lobby.round_revealed;

  return {
    joinCode: lobby.join_code,
    status: lobby.status,
    hostPlayerId: lobby.host_player_id,
    currentRound: roundIndex + 1,
    totalRounds: lobby.total_rounds,
    roundRevealed: lobby.round_revealed,
    timeLimit: lobby.round_time_limit_seconds,
    roundDeadlineAt: lobby.round_deadline_at,
    revealDeadlineAt: lobby.reveal_deadline_at,
    serverTime: new Date().toISOString(),
    round:
      playing && round
        ? {
            panoId: round.panoId,
            heading: round.heading,
            pitch: round.pitch,
            zoom: round.zoom,
          }
        : null,
    actualLocation:
      revealed && round ? { lat: round.lat, lng: round.lng } : null,
    you: viewer
      ? {
          playerId: viewer.id,
          isHost: viewer.id === lobby.host_player_id,
          hasGuessed: Boolean(resultForRound(viewer, roundIndex)),
        }
      : null,
    players: players.map((player) => {
      const result = resultForRound(player, roundIndex);
      return {
        playerId: player.id,
        displayName: player.display_name,
        totalScore: player.total_score,
        isConnected: player.is_connected,
        hasGuessed: Boolean(result),
        ...(revealed
          ? {
              roundScore: result?.score ?? 0,
              roundDistance: result?.distance ?? null,
              guessLocation: result?.guessLocation ?? null,
            }
          : {}),
      };
    }),
  };
}

/** Reset cached availability. Test-only. */
export function resetLobbyStoreState(): void {
  lobbyTablesAvailable = true;
  hasWarnedAboutMissingTables = false;
}

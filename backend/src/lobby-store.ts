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

  return { playerId, playerToken };
}

export async function startLobby(
  joinCode: string,
  playerToken: string
): Promise<LobbyStatePayload> {
  const lobby = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(lobby.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    throw createHttpError(403, "You are not in this lobby.");
  }
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

  return buildStatePayload(started, players, viewer);
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
  const lobby = await fetchLobbyByCode(joinCode);
  const players = await fetchPlayers(lobby.id);
  const viewer = findViewer(players, playerToken);

  if (!viewer) {
    throw createHttpError(403, "You are not in this lobby.");
  }

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
    // Touch presence so "who is still here" stays roughly accurate.
    void guarded(() =>
      updateSingleRow<LobbyPlayerRecord>(
        LOBBY_PLAYERS_TABLE,
        { is_connected: true, last_seen_at: new Date().toISOString() },
        { filters: { id: viewer.id }, columns: "id" }
      )
    ).catch(() => undefined);
  }

  const settled = await settleLobby(lobby, players);
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

  let currentLobby = lobby;
  let currentPlayers = players;

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
    }
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

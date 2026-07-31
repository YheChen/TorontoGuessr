import { URL } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  createGameSession,
  getGameSummary,
  getDailyGameStats,
  getLeaderboard,
  getRoundForClient,
  getTorontoDateKey,
  saveUsername,
  seedFromString,
  submitGuess,
} from "./game-store.js";
import {
  deleteRejectedLocations,
  getLocationReviewQueue,
  selectGameRounds,
  updateLocationReviewStatus,
} from "./services/location-service.js";
import {
  createHttpError,
  isHttpError,
  matchRoute,
  normalizePathname,
  readBody,
  sendError,
  sendJson,
  setCorsHeaders,
} from "./http-utils.js";
import { GAME_MODES, LEADERBOARD_PERIODS, type GameRound } from "./types.js";
import { sanitizeUsername } from "./username-utils.js";
import { normalizeShortCode } from "./short-code.js";
import {
  createChallengeFromSession,
  getChallengeRounds,
} from "./challenge-store.js";
import {
  advanceLobby,
  createLobby,
  getLobbyState,
  joinLobby,
  leaveLobby,
  startLobby,
  submitLobbyGuess,
} from "./lobby-store.js";
import {
  createTimings,
  enterRequestTimings,
  logRequestTiming,
} from "./observability.js";
import { checkRateLimit, clientIp } from "./rate-limit.js";
import { requireAdminToken } from "./admin-auth.js";
import { readPlayToken } from "./play-token.js";
import { optionalUser, requireUser } from "./auth.js";
import {
  getGameHistory,
  getOrCreateProfile,
  importStreakBest,
  setDisplayName,
} from "./profile-store.js";

/**
 * A guessed point on Earth.
 *
 * Bounded, not just `z.number()`. A bare number accepts Infinity (JSON `1e999`
 * parses to it), which made calculateDistance return NaN; JSON.stringify then
 * wrote `distance: null` and `guessLocation: {"lat": null, "lng": 0}` into
 * lobby_players.results, and the reveal serves that to every other player in the
 * lobby, where the Google Maps calls throw on a null latitude. Bounding the range
 * rejects it at the edge instead of relying on every downstream consumer.
 */
const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * A session id from the URL, rejected early if it is not a UUID.
 *
 * Not cosmetic validation. An unvalidated segment becomes the `id` filter value,
 * PostgREST echoes it verbatim in its uuid cast error, and isMissingColumnError()
 * pattern-matches that error TEXT. A crafted id could therefore make the message
 * look like a missing-column error and latch game-store's module-level
 * sessionSchemaExtended flag to false for the life of the warm instance, silently
 * disabling round-deadline enforcement and daily challenges.
 */
function requireSessionId(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) {
    throw createHttpError(400, "That game session id is not valid.");
  }
  return parsed.data;
}

const guessSchema = z.object({
  guessLocation: coordinateSchema.nullable().optional(),
});
const usernameSchema = z.object({
  username: z.string().optional(),
});
const startGameSchema = z.object({
  mode: z.enum(GAME_MODES).default("classic"),
  /** Required when mode is "challenge"; validated by normalizeShortCode. */
  challengeCode: z.string().max(32).optional(),
});
const leaderboardPeriodSchema = z.enum(LEADERBOARD_PERIODS);
const leaderboardQuerySchema = z.object({
  period: leaderboardPeriodSchema.default("lifetime"),
  board: z.enum(["global", "challenge"]).default("global"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
const adminLocationReviewQuerySchema = z.object({
  index: z.coerce.number().int().min(0).default(0),
  locationId: z.string().uuid().optional(),
});
const adminLocationReviewActionSchema = z.object({
  action: z.enum(["accept", "reject", "undo"]),
});
const lobbyNameSchema = z.object({
  displayName: z.string().optional(),
});
const lobbyGuessSchema = z.object({
  guessLocation: coordinateSchema.nullable().optional(),
});

/**
 * Player credential for lobby routes. Sent as a header rather than a query
 * parameter so it never lands in a URL, matching the admin-token convention.
 */
function lobbyPlayerToken(request: IncomingMessage): string {
  const header = request.headers["x-player-token"];
  const token = typeof header === "string" ? header.trim() : "";
  if (!token) {
    throw createHttpError(401, "Missing player token.");
  }
  return token;
}

function requireLobbyCode(rawCode: string): string {
  const code = normalizeShortCode(rawCode);
  if (!code) {
    throw createHttpError(400, "That lobby code is not valid.");
  }
  return code;
}

const displayNameSchema = z.object({
  displayName: z.string().max(64).optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Bounded at the edge as well as clamped in importStreakBest, so an absurd value
// is refused rather than quietly reduced. 10000 is far past any real streak and
// well inside the integer column.
const streakImportSchema = z.object({
  bestStreak: z.number().int().min(0).max(10_000),
});

const gameStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional(),
  timeZone: z.string().trim().min(1).max(100).optional(),
});

export async function routeRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  // The vercel.json rewrite funnels /api/* into this function and carries the
  // original path in the `path` query parameter. Prefer it when present;
  // direct requests (local server, tests) keep using the URL path.
  const forwardedPath = url.searchParams.get("path");
  const pathname = normalizePathname(
    forwardedPath
      ? forwardedPath.startsWith("/")
        ? forwardedPath
        : `/${forwardedPath}`
      : url.pathname
  );

  // Instrument this request: bind a timings accumulator to the async context
  // (the Supabase client adds to it) and log one line when the response ends.
  const timings = createTimings();
  const startedAt = performance.now();
  enterRequestTimings(timings);
  response.on("finish", () => {
    logRequestTiming(
      request.method ?? "?",
      pathname,
      response.statusCode,
      performance.now() - startedAt,
      timings
    );
  });

  try {
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && pathname === "/admin/review-locations") {
      requireAdminToken(request);
      const query = adminLocationReviewQuerySchema.parse({
        index: url.searchParams.get("index") ?? undefined,
        locationId: url.searchParams.get("locationId") ?? undefined,
      });

      sendJson(response, 200, await getLocationReviewQueue(query));
      return;
    }

    if (
      request.method === "DELETE" &&
      pathname === "/admin/review-locations/rejected"
    ) {
      requireAdminToken(request);
      sendJson(response, 200, await deleteRejectedLocations());
      return;
    }

    if (request.method === "POST" && pathname === "/games/start") {
      // Starting a game is the most expensive route (Street View + inserts),
      // so cap it per IP to deter session spam.
      const rateLimit = checkRateLimit(`games-start:${clientIp(request)}`, {
        limit: 20,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(
          response,
          429,
          "Too many new games from this address. Please wait a moment and try again."
        );
        return;
      }

      const { mode, challengeCode: requestedCode } = startGameSchema.parse(
        await readBody(request)
      );

      let rounds: GameRound[];
      let challengeDate: string | null = null;
      let challengeCode: string | null = null;

      if (mode === "challenge") {
        // Shared challenge: replay the snapshotted rounds so every player who
        // opens the link sees exactly the same five locations.
        challengeCode = normalizeShortCode(requestedCode);
        if (!challengeCode) {
          throw createHttpError(400, "That challenge code is not valid.");
        }

        const snapshot = await getChallengeRounds(challengeCode);
        if (!snapshot) {
          throw createHttpError(
            404,
            "That challenge could not be found. Check the link and try again."
          );
        }
        rounds = snapshot;
      } else {
        challengeDate = mode === "daily" ? getTorontoDateKey() : null;
        // Daily challenge: everyone gets the same rounds for a given date.
        const seed = challengeDate ? seedFromString(challengeDate) : null;
        rounds = await selectGameRounds(5, seed);
      }

      const { session, playToken } = await createGameSession(rounds, {
        mode,
        challengeDate,
      });
      const payload = await getRoundForClient(session.id, { playToken });
      if (!payload) {
        throw new Error("New game session is missing its first round.");
      }

      sendJson(response, 200, {
        sessionId: session.id,
        // The only time this token is ever sent. Only its hash is stored, so it
        // cannot be reissued: a client that loses it has lost that game.
        playToken,
        username: session.username,
        mode: session.mode,
        challengeDate: session.challengeDate,
        challengeCode,
        ...payload,
      });
      return;
    }

    const guessParams = matchRoute(pathname, "/games/:sessionId/guess");
    if (request.method === "POST" && guessParams?.sessionId) {
      // optionalUser, never requireUser: a guest sends no Authorization header,
      // gets null, and plays exactly as before. Resolved before anything is read
      // or written, so the 401 it raises for an expired token leaves no state
      // behind and the client's refresh-and-retry is safe to repeat.
      const user = await optionalUser(request);
      const parsedBody = guessSchema.parse(await readBody(request));
      const result = await submitGuess(
        requireSessionId(guessParams.sessionId),
        parsedBody.guessLocation ?? null,
        { userId: user?.userId ?? null, playToken: readPlayToken(request) }
      );
      sendJson(response, 200, result);
      return;
    }

    const nextParams = matchRoute(pathname, "/games/:sessionId/next");
    if (request.method === "POST" && nextParams?.sessionId) {
      const sessionId = requireSessionId(nextParams.sessionId);
      // Deliberately does NOT reset the round deadline. It used to, which meant
      // a client could keep pinging /next during a round and push the 60s + 15s
      // server-side timeout out indefinitely, defeating the timer entirely. The
      // clock is already baselined twice without help: at insert for round one,
      // and at guess time for every round after (game-store.ts). The prefetched
      // panorama makes the transition near-instant and the 15s grace absorbs the
      // round trip, so nothing legitimate loses time.
      const nextRound = await getRoundForClient(sessionId, {
        playToken: readPlayToken(request),
      });
      if (nextRound === null) {
        sendJson(response, 200, {
          gameFinished: true,
          summary: await getGameSummary(sessionId),
        });
        return;
      }

      sendJson(response, 200, nextRound);
      return;
    }

    const challengeParams = matchRoute(pathname, "/games/:sessionId/challenge");
    if (request.method === "POST" && challengeParams?.sessionId) {
      // Each call writes a row, so cap it per IP like new games are capped.
      const rateLimit = checkRateLimit(
        `challenge-create:${clientIp(request)}`,
        { limit: 10, windowMs: 60_000 }
      );
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(
          response,
          429,
          "Too many challenge links from this address. Please wait a moment and try again."
        );
        return;
      }

      sendJson(
        response,
        200,
        await createChallengeFromSession(
          requireSessionId(challengeParams.sessionId),
          { playToken: readPlayToken(request) }
        )
      );
      return;
    }

    const usernameParams = matchRoute(pathname, "/games/:sessionId/username");
    if (request.method === "POST" && usernameParams?.sessionId) {
      const parsedBody = usernameSchema.parse(await readBody(request));
      const username = sanitizeUsername(parsedBody.username);
      sendJson(response, 200, {
        saved: await saveUsername(
          requireSessionId(usernameParams.sessionId),
          username,
          { playToken: readPlayToken(request) }
        ),
      });
      return;
    }

    if (request.method === "GET" && pathname === "/leaderboard") {
      const query = leaderboardQuerySchema.parse({
        period: url.searchParams.get("period") ?? undefined,
        board: url.searchParams.get("board") ?? undefined,
        page: url.searchParams.get("page") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
      });

      const leaderboard = await getLeaderboard(query);
      // Leaderboards tolerate short staleness; let the CDN absorb the reads.
      // Set only on success so error responses are never cached.
      response.setHeader(
        "Cache-Control",
        "public, s-maxage=30, stale-while-revalidate=60"
      );
      sendJson(response, 200, leaderboard);
      return;
    }

    if (request.method === "GET" && pathname === "/stats/games") {
      const query = gameStatsQuerySchema.parse({
        days: url.searchParams.get("days") ?? undefined,
        timeZone: url.searchParams.get("timeZone") ?? undefined,
      });

      const stats = await getDailyGameStats(query);
      // Aggregate stats tolerate a minute of staleness; let the CDN absorb
      // repeat reads. Set only on success so errors are never cached.
      response.setHeader(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300"
      );
      sendJson(response, 200, stats);
      return;
    }

    const adminReviewParams = matchRoute(
      pathname,
      "/admin/review-locations/:locationId"
    );
    if (request.method === "PATCH" && adminReviewParams?.locationId) {
      requireAdminToken(request);
      const parsedBody = adminLocationReviewActionSchema.parse(
        await readBody(request)
      );

      sendJson(response, 200, {
        location: await updateLocationReviewStatus(
          adminReviewParams.locationId,
          parsedBody.action
        ),
      });
      return;
    }

    if (request.method === "POST" && pathname === "/lobbies") {
      const rateLimit = checkRateLimit(`lobby-create:${clientIp(request)}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(
          response,
          429,
          "Too many new lobbies from this address. Please wait a moment and try again."
        );
        return;
      }

      const { displayName } = lobbyNameSchema.parse(await readBody(request));
      sendJson(response, 200, await createLobby(displayName ?? ""));
      return;
    }

    const lobbyJoinParams = matchRoute(pathname, "/lobbies/:code/join");
    if (request.method === "POST" && lobbyJoinParams?.code) {
      const rateLimit = checkRateLimit(`lobby-join:${clientIp(request)}`, {
        limit: 20,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(response, 429, "Too many join attempts. Please wait a moment.");
        return;
      }

      const { displayName } = lobbyNameSchema.parse(await readBody(request));
      sendJson(
        response,
        200,
        await joinLobby(requireLobbyCode(lobbyJoinParams.code), displayName ?? "")
      );
      return;
    }

    const lobbyStateParams = matchRoute(pathname, "/lobbies/:code/state");
    if (request.method === "GET" && lobbyStateParams?.code) {
      // Clients poll this every couple of seconds, so it needs a far higher
      // ceiling than the mutating routes.
      const rateLimit = checkRateLimit(`lobby-state:${clientIp(request)}`, {
        limit: 120,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(response, 429, "Polling too quickly. Please slow down.");
        return;
      }

      const header = request.headers["x-player-token"];
      const token = typeof header === "string" && header.trim() ? header.trim() : null;
      // Never cached: lobby state must always be fresh.
      sendJson(
        response,
        200,
        await getLobbyState(requireLobbyCode(lobbyStateParams.code), token)
      );
      return;
    }

    const lobbyStartParams = matchRoute(pathname, "/lobbies/:code/start");
    if (request.method === "POST" && lobbyStartParams?.code) {
      sendJson(
        response,
        200,
        await startLobby(
          requireLobbyCode(lobbyStartParams.code),
          lobbyPlayerToken(request)
        )
      );
      return;
    }

    const lobbyGuessParams = matchRoute(pathname, "/lobbies/:code/guess");
    if (request.method === "POST" && lobbyGuessParams?.code) {
      const rateLimit = checkRateLimit(`lobby-guess:${clientIp(request)}`, {
        limit: 60,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(response, 429, "Too many guesses. Please wait a moment.");
        return;
      }

      const parsedBody = lobbyGuessSchema.parse(await readBody(request));
      sendJson(
        response,
        200,
        await submitLobbyGuess(
          requireLobbyCode(lobbyGuessParams.code),
          lobbyPlayerToken(request),
          parsedBody.guessLocation ?? null
        )
      );
      return;
    }

    const lobbyNextParams = matchRoute(pathname, "/lobbies/:code/next");
    if (request.method === "POST" && lobbyNextParams?.code) {
      sendJson(
        response,
        200,
        await advanceLobby(
          requireLobbyCode(lobbyNextParams.code),
          lobbyPlayerToken(request)
        )
      );
      return;
    }

    const lobbyLeaveParams = matchRoute(pathname, "/lobbies/:code/leave");
    if (request.method === "POST" && lobbyLeaveParams?.code) {
      sendJson(
        response,
        200,
        await leaveLobby(
          requireLobbyCode(lobbyLeaveParams.code),
          lobbyPlayerToken(request)
        )
      );
      return;
    }

    // Accounts are optional: only these routes require a signed-in user.
    if (request.method === "GET" && pathname === "/me") {
      sendJson(response, 200, {
        profile: await getOrCreateProfile(await requireUser(request)),
      });
      return;
    }

    if (request.method === "GET" && pathname === "/me/games") {
      const user = await requireUser(request);
      const query = historyQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
      });

      sendJson(response, 200, await getGameHistory(user.userId, query));
      return;
    }

    // A one-time carry of a streak earned before the account existed. Only ever
    // raises `best`, and is clamped to the days the game has been open; `current`
    // stays derived from played games and cannot be set from here.
    if (request.method === "POST" && pathname === "/me/streak") {
      const rateLimit = checkRateLimit(`streak-import:${clientIp(request)}`, {
        limit: 10,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(response, 429, "Too many updates. Please wait a moment.");
        return;
      }

      const user = await requireUser(request);
      const body = streakImportSchema.parse(await readBody(request));
      sendJson(response, 200, {
        profile: await importStreakBest(user, body.bestStreak),
      });
      return;
    }

    if (request.method === "PATCH" && pathname === "/me") {
      const rateLimit = checkRateLimit(`profile-update:${clientIp(request)}`, {
        limit: 20,
        windowMs: 60_000,
      });
      if (!rateLimit.allowed) {
        response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
        sendError(response, 429, "Too many updates. Please wait a moment.");
        return;
      }

      const user = await requireUser(request);
      const body = displayNameSchema.parse(await readBody(request));
      sendJson(response, 200, {
        profile: await setDisplayName(user, body.displayName),
      });
      return;
    }

    sendError(response, 404, "Route not found.");
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(response, 400, "Invalid request payload.");
      return;
    }

    if (isHttpError(error)) {
      sendError(response, error.statusCode, error.message);
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, 500, message);
  }
}

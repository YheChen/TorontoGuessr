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
import { LEADERBOARD_PERIODS } from "./types.js";
import { sanitizeUsername } from "./username-utils.js";
import {
  createTimings,
  enterRequestTimings,
  logRequestTiming,
} from "./observability.js";
import { checkRateLimit, clientIp } from "./rate-limit.js";

const guessSchema = z.object({
  guessLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .nullable()
    .optional(),
});
const usernameSchema = z.object({
  username: z.string().optional(),
});
const startGameSchema = z.object({
  mode: z.enum(["classic", "daily"]).default("classic"),
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
const gameStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional(),
  timeZone: z.string().trim().min(1).max(100).optional(),
});

function requireAdminToken(request: IncomingMessage): void {
  const expectedToken = process.env.ADMIN_REVIEW_TOKEN?.trim();

  if (!expectedToken) {
    throw createHttpError(500, "ADMIN_REVIEW_TOKEN is not configured.");
  }

  const authHeader = request.headers.authorization;
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const headerToken = request.headers["x-admin-token"];
  const providedToken =
    typeof headerToken === "string" && headerToken.trim()
      ? headerToken.trim()
      : bearerToken;

  if (providedToken !== expectedToken) {
    throw createHttpError(401, "Unauthorized.");
  }
}

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

      const { mode } = startGameSchema.parse(await readBody(request));
      const challengeDate = mode === "daily" ? getTorontoDateKey() : null;
      // Daily challenge: everyone gets the same rounds for a given date.
      const seed = challengeDate ? seedFromString(challengeDate) : null;
      const rounds = await selectGameRounds(5, seed);
      const session = await createGameSession(rounds, { mode, challengeDate });
      const payload = await getRoundForClient(session.id);
      if (!payload) {
        throw new Error("New game session is missing its first round.");
      }

      sendJson(response, 200, {
        sessionId: session.id,
        username: session.username,
        mode: session.mode,
        challengeDate: session.challengeDate,
        ...payload,
      });
      return;
    }

    const guessParams = matchRoute(pathname, "/games/:sessionId/guess");
    if (request.method === "POST" && guessParams?.sessionId) {
      const parsedBody = guessSchema.parse(await readBody(request));
      const result = await submitGuess(
        guessParams.sessionId,
        parsedBody.guessLocation ?? null
      );
      sendJson(response, 200, result);
      return;
    }

    const nextParams = matchRoute(pathname, "/games/:sessionId/next");
    if (request.method === "POST" && nextParams?.sessionId) {
      const nextRound = await getRoundForClient(nextParams.sessionId, {
        touchDeadline: true,
      });
      if (nextRound === null) {
        sendJson(response, 200, {
          gameFinished: true,
          summary: await getGameSummary(nextParams.sessionId),
        });
        return;
      }

      sendJson(response, 200, nextRound);
      return;
    }

    const usernameParams = matchRoute(pathname, "/games/:sessionId/username");
    if (request.method === "POST" && usernameParams?.sessionId) {
      const parsedBody = usernameSchema.parse(await readBody(request));
      const username = sanitizeUsername(parsedBody.username);
      sendJson(response, 200, {
        saved: await saveUsername(usernameParams.sessionId, username),
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

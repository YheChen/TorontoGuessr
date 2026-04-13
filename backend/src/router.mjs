import { URL } from "node:url";
import { z } from "zod";
import {
  createGameSession,
  LEADERBOARD_PERIODS,
  getGameSummary,
  getDailyGameStats,
  getLeaderboard,
  getRoundForClient,
  saveUsername,
  submitGuess,
} from "./game-store.mjs";
import {
  deleteRejectedLocations,
  getLocationReviewQueue,
  updateLocationReviewStatus,
} from "./services/location-service.mjs";
import {
  matchRoute,
  normalizePathname,
  readBody,
  sendError,
  sendJson,
  setCorsHeaders,
} from "./http-utils.mjs";
import { selectGameRounds } from "./services/location-service.mjs";
import { sanitizeUsername } from "./username-utils.mjs";

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
const leaderboardPeriodSchema = z.enum(LEADERBOARD_PERIODS);
const leaderboardQuerySchema = z.object({
  period: leaderboardPeriodSchema.default("lifetime"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});
const adminLocationReviewQuerySchema = z.object({
  index: z.coerce.number().int().min(0).default(0),
});
const adminLocationReviewActionSchema = z.object({
  action: z.enum(["accept", "reject", "undo"]),
});
const gameStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional(),
  timeZone: z.string().trim().min(1).max(100).optional(),
});

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireAdminToken(request) {
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

export async function routeRequest(request, response) {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const pathname = normalizePathname(url.pathname);

  try {
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, { status: "ok" });
      return;
    }

    if (request.method === "GET" && pathname === "/admin/review-locations") {
      requireAdminToken(request);
      const query = adminLocationReviewQuerySchema.parse({
        index: url.searchParams.get("index") ?? undefined,
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
      const rounds = await selectGameRounds(5);
      const session = await createGameSession(rounds);
      const payload = await getRoundForClient(session.id);
      if (!payload) {
        throw new Error("New game session is missing its first round.");
      }

      sendJson(response, 200, {
        sessionId: session.id,
        ...payload,
      });
      return;
    }

    const guessParams = matchRoute(pathname, "/games/:sessionId/guess");
    if (request.method === "POST" && guessParams) {
      const parsedBody = guessSchema.parse(await readBody(request));
      const result = await submitGuess(
        guessParams.sessionId,
        parsedBody.guessLocation ?? null
      );
      sendJson(response, 200, result);
      return;
    }

    const nextParams = matchRoute(pathname, "/games/:sessionId/next");
    if (request.method === "POST" && nextParams) {
      const nextRound = await getRoundForClient(nextParams.sessionId);
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
    if (request.method === "POST" && usernameParams) {
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
        page: url.searchParams.get("page") ?? undefined,
        limit: url.searchParams.get("limit") ?? undefined,
      });

      sendJson(response, 200, await getLeaderboard(query));
      return;
    }

    if (request.method === "GET" && pathname === "/stats/games") {
      const query = gameStatsQuerySchema.parse({
        days: url.searchParams.get("days") ?? undefined,
        timeZone: url.searchParams.get("timeZone") ?? undefined,
      });

      sendJson(response, 200, await getDailyGameStats(query));
      return;
    }

    const adminReviewParams = matchRoute(
      pathname,
      "/admin/review-locations/:locationId"
    );
    if (request.method === "PATCH" && adminReviewParams) {
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

    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
    ) {
      sendError(response, error.statusCode, error.message);
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, 500, message);
  }
}

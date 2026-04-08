import { URL } from "node:url";
import { z } from "zod";
import {
  createGameSession,
  getGameSummary,
  getLeaderboard,
  getRoundForClient,
  submitGuess,
} from "./game-store.mjs";
import {
  matchRoute,
  normalizePathname,
  readBody,
  sendError,
  sendJson,
  setCorsHeaders,
} from "./http-utils.mjs";
import { selectGameRounds } from "./services/location-service.mjs";

const guessSchema = z.object({
  guessLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .nullable()
    .optional(),
});

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

    if (request.method === "GET" && pathname === "/leaderboard") {
      sendJson(response, 200, { entries: await getLeaderboard() });
      return;
    }

    sendError(response, 404, "Route not found.");
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendError(response, 400, "Invalid request payload.");
      return;
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";
    sendError(response, 500, message);
  }
}

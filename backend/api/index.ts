import type { IncomingMessage, ServerResponse } from "node:http";
import { routeRequest } from "../src/router.js";

/**
 * Single serverless function serving every API route. vercel.json rewrites
 * all /api/* paths here; the shared router dispatches on the request path.
 */
export default async function handler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  return routeRequest(request, response);
}

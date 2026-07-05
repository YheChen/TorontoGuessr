import type { IncomingMessage, ServerResponse } from "node:http";
import { routeRequest } from "../src/router";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  return routeRequest(request, response);
}

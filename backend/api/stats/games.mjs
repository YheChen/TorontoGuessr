import { routeRequest } from "../../src/router.mjs";

export default async function handler(request, response) {
  return routeRequest(request, response);
}

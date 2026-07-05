import http from "node:http";
import { loadEnv } from "./env.js";
import { routeRequest } from "./router.js";

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);

const server = http.createServer((request, response) => {
  void routeRequest(request, response);
});

server.listen(PORT, () => {
  console.log(`TorontoGuessr backend running on http://localhost:${PORT}`);
});

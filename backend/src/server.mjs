import http from "node:http";
import { loadEnv } from "./env.mjs";
import { routeRequest } from "./router.mjs";

loadEnv();

const PORT = Number(process.env.PORT ?? 3001);

const server = http.createServer(routeRequest);

server.listen(PORT, () => {
  console.log(`TorontoGuessr backend running on http://localhost:${PORT}`);
});

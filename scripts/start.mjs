import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["run", "start:backend"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
  }),
  spawn("npm", ["run", "start:frontend"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
  }),
];

const shutdown = () => {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const child of processes) {
  child.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown();
      process.exitCode = code;
    }
  });
}

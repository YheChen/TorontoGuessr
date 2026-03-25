import { spawnSync } from "node:child_process";

const commands = [
  ["npm", ["run", "build:backend"]],
  ["npm", ["run", "build:frontend"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

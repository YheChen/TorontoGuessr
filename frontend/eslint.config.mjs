// Flat config, because Next 16 removed `next lint`. Without the subcommand the
// old script ran `next lint` and Next read "lint" as a directory name:
//
//   Invalid project directory provided, no such directory: frontend/lint
//
// So lint now invokes eslint directly. eslint-config-next is deliberately still
// on 15 and consumed through FlatCompat rather than being upgraded alongside
// Next. Version 16 of that config pulls in eslint-plugin-react-hooks 6, whose
// new rules report 17 errors across 13 files, most of them set-state-in-effect
// in game and lobby code. Those are worth fixing, but they are a behavioural
// change and do not belong in a framework bump, so the two upgrades are kept
// apart. See the note on the closed eslint-config-next PR.
import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";

const compat = new FlatCompat({
  baseDirectory: path.dirname(fileURLToPath(import.meta.url)),
});

// Named rather than exported inline: this file is now linted by its own config,
// and next/core-web-vitals forbids an anonymous default export.
const config = [
  // components/ui is generated (shadcn); the rest never wants linting.
  { ignores: ["components/ui/**", ".next/**", "node_modules/**"] },
  ...compat.extends("next/core-web-vitals"),
];

export default config;

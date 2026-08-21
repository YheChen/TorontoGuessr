import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    // .tsx included so component tests are picked up at all. Without it a whole
    // test file can sit in the repo looking green because it never ran.
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Still node by default: the pure-function suites are the majority and do
    // not need a DOM. Component tests opt in per file with a
    // `@vitest-environment jsdom` docblock, which is explicit at the point of
    // use and does not depend on config globs staying in sync with filenames.
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
  },
  // The Next tsconfig sets jsx: "preserve" because Next does its own transform,
  // so the JSX has to be given a runtime here or the .tsx suites reach
  // vite:import-analysis untransformed and fail to parse. That is worth stating
  // precisely, because the option this lives under is not stable across
  // versions: it was esbuild.jsx until Vite 8 replaced esbuild with Oxc as the
  // default transformer, at which point the old key was silently ignored rather
  // than reported. A plugin would work too; one option is less to install.
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

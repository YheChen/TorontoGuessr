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
  // The Next tsconfig sets jsx: "preserve" because Next does its own transform.
  // esbuild would then hand untransformed JSX to the runtime, so the automatic
  // runtime is selected here instead of adding a plugin for it.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "react",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser checks, run against a DEPLOYED site.
 *
 * Never against a local dev server, and that is not a preference. The Google
 * Maps API key is referrer-restricted to the production domain, so a localhost
 * page gets a RefererNotAllowedMapError and neither the panorama nor the guess
 * map ever mounts, which is most of what these tests exist to look at.
 *
 * WHY THIS EXISTS AT ALL. The jsdom suite in tests/ cannot see layout: jsdom
 * computes none, getBoundingClientRect returns zeros, and no stylesheet applies.
 * The 272px gap above the round results in PR 39 (Google Maps writing inline
 * position:relative onto a node whose `fixed` class the layout depended on) was
 * invisible to every test in the repo and was found by eye, in production. This
 * file is the only thing that would catch the next one.
 */

const baseURL =
  process.env.E2E_BASE_URL?.replace(/\/$/, "") ?? "https://www.torontoguessr.ca";

// Vercel preview deployments sit behind SSO, so a preview run needs the
// project's automation bypass secret. Absent, this is a production run and the
// header is simply not sent.
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./e2e",
  // Serial. Each gameplay test starts a real game against the real backend, and
  // /games/start is rate limited per IP; a parallel run from one CI address
  // would be testing the rate limiter instead of the layout.
  workers: 1,
  fullyParallel: false,
  // Retried once. These talk to Google Maps and Street View over the network,
  // which fails occasionally for reasons that are not this repo's fault.
  retries: 2,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    // A fixed viewport, because every assertion here is about geometry.
    viewport: { width: 1280, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    extraHTTPHeaders: bypassSecret
      ? { "x-vercel-protection-bypass": bypassSecret }
      : {},
  },
  projects: [{ name: "chromium" }],
});

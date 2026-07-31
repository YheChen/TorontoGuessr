import { expect, test, type Page } from "@playwright/test";

/**
 * The bug class nothing else in this repo can catch.
 *
 * Every assertion here is either a measured geometry or a real cross-origin
 * request. jsdom gives neither: it computes no layout, getBoundingClientRect
 * returns zeros, no stylesheet applies, and it does not preflight.
 *
 * FOOTPRINT. Reaching the results stage means starting a real game against the
 * real backend, so each run leaves one game_sessions row. It deliberately stops
 * after ONE round of five, so the session stays in_progress, never finishes, and
 * therefore never reaches the leaderboard or the daily stats. An abandoned
 * in-progress row is already the overwhelmingly common shape in that table.
 *
 * WHERE IT CAN RUN. Only against a deployment on an origin the Google Maps key
 * allows, which today means the production domain. A localhost build renders the
 * map containers but Maps refuses the referrer, so no pin can be placed; the
 * suite asserts the absence of that error rather than sailing past it, which is
 * why a local run fails loudly instead of silently proving nothing.
 */

/** Google's own text when it refuses the referrer or the key. */
const MAPS_FAILURE = /didn't load Google Maps correctly|for development purposes only/i;

/** The nav is sticky, so its bottom edge is the offset every page sits below. */
async function navBottom(page: Page): Promise<number> {
  const box = await page.locator("header, nav").first().boundingBox();
  return box ? box.y + box.height : 0;
}

/** Horizontal overflow of the document, in pixels. */
function pageOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
}

/**
 * How much sideways overflow is tolerated.
 *
 * 1px, which is a sub-pixel rounding guard and nothing more: every page measures
 * exactly 0 at all nineteen widths swept below. It was briefly 8px to accommodate
 * a real 4px escape from a decorative glow behind the hero; that is fixed, so the
 * bar is back where it belongs.
 */
const OVERFLOW_TOLERANCE_PX = 1;

/**
 * Widths swept by the responsive check.
 *
 * The three boundary values are the point. A single 877px min-content width in
 * the hero used to blow the whole layout out between 640px and 1023px, worst at
 * 640px with 281px of sideways scroll, while 390px and 1280px both measured a
 * tidy 4px and looked fine. Testing two comfortable widths proved nothing about
 * the band in between, which includes 768px, the commonest tablet width there is.
 * 767/768/769 bracket the md breakpoint, where the desktop nav appears and where
 * the navbar used to spill its Play button past the viewport edge.
 */
const SWEEP_WIDTHS = [
  320, 360, 390, 414, 540, 640, 700, 767, 768, 769, 834, 900, 1023, 1024, 1280,
  1440, 1920,
] as const;

/** Pages that render fully without Google Maps, so a sweep can be cheap. */
const SWEEP_PATHS = ["/", "/leaderboard", "/about", "/stats", "/lobby"] as const;

test("the landing page renders its hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /play/i }).first()).toBeVisible();
  expect(await pageOverflow(page), "horizontal page overflow").toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
});

test("the sign-in dialog opens", async ({ page }) => {
  await page.goto("/");

  const signIn = page.getByRole("button", { name: /sign in/i }).first();
  // Skipped rather than failed when accounts are not configured for the target:
  // isAuthConfigured renders no control at all, and that is a deployment choice,
  // not a regression.
  if ((await signIn.count()) === 0) {
    test.skip(true, "Accounts are not configured on this deployment.");
  }

  await signIn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/email/i)).toBeVisible();
});

test("the leaderboard renders rows or says it is empty", async ({ page }) => {
  await page.goto("/leaderboard");
  // Either real rows or a stated empty state. A blank panel is the failure.
  const rows = page.getByTestId("leaderboard-row");
  const empty = page.getByText(/no scores yet/i);
  await expect(rows.first().or(empty.first())).toBeVisible();
  expect(await pageOverflow(page), "horizontal page overflow").toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
});

/**
 * No page may scroll sideways, at any width.
 *
 * The cheapest test here and the one that would have caught the most: a hero
 * column stuck at 877px across the whole tablet band, and a navbar spilling its
 * Play button past the viewport edge at exactly 768px. Neither was visible at the
 * two widths the rest of this file happens to use.
 */
test("no page scrolls sideways at any width", async ({ page }) => {
  const failures: string[] = [];

  for (const path of SWEEP_PATHS) {
    for (const width of SWEEP_WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const overflow = await pageOverflow(page);
      if (overflow > OVERFLOW_TOLERANCE_PX) {
        failures.push(`${path} at ${width}px overflows by ${overflow}px`);
      }
    }
  }

  expect(failures, failures.join("; ")).toEqual([]);
});

/**
 * The navbar has to fit inside its own container.
 *
 * Separate from the overflow sweep because it fails EARLIER and says more. When
 * the three navbar groups need more than the content box, justify-between runs
 * out of free space and the last one spills right; at 768px that clipped the Play
 * button's rounded corner flat against the viewport edge while the document
 * itself only reported 1px, which is easy to dismiss as rounding.
 */
test("the navbar fits inside its container at every width", async ({ page }) => {
  const failures: string[] = [];
  await page.goto("/");

  for (const width of SWEEP_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    const spill = await page.evaluate(() => {
      const inner = document.querySelector("header > div");
      if (!(inner instanceof HTMLElement)) return 0;
      const last = inner.lastElementChild;
      if (!(last instanceof HTMLElement)) return 0;
      const paddingRight = parseFloat(getComputedStyle(inner).paddingRight);
      const contentRight = inner.getBoundingClientRect().right - paddingRight;
      return last.getBoundingClientRect().right - contentRight;
    });
    if (spill > 1) {
      failures.push(`the navbar spills ${Math.round(spill)}px at ${width}px`);
    }
  }

  expect(failures, failures.join("; ")).toEqual([]);
});

test.describe("a round of play", () => {
  test("mounts both maps, scores a guess, and keeps the results flush", async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/games/") && !response.ok()) {
        failures.push(
          `${response.status()} ${response.request().method()} ${response.url()}`
        );
      }
    });

    await page.goto("/game");

    const panorama = page.getByTestId("game-panorama");
    const map = page.getByTestId("game-map");
    await expect(panorama).toBeVisible();
    await expect(map).toBeVisible();

    // A broken or referrer-refused Maps key takes the entire game down while the
    // API keeps answering 200, so the existing curl smoke test would not notice.
    // Checked before anything else, because every assertion after it depends on
    // Maps working and would otherwise fail for a misleading reason.
    //
    // The wait is not padding. Google paints its own error banner a beat after
    // the container mounts, and toHaveCount(0) passes the instant the text is
    // absent, so without it this raced: some runs sailed past a map that was
    // already dead and then failed several steps later with an unrelated-looking
    // message. Confirmed by reading the console, which says
    // RefererNotAllowedMapError.
    await page.waitForTimeout(2_000);
    await expect(
      page.getByText(MAPS_FAILURE),
      "Google Maps refused to load"
    ).toHaveCount(0);

    // Both surfaces are real, sized boxes, not collapsed containers that exist.
    for (const [name, locator] of [
      ["panorama", panorama],
      ["map", map],
    ] as const) {
      const box = await locator.boundingBox();
      expect(box, `${name} has no box`).not.toBeNull();
      expect(box!.width, `${name} width`).toBeGreaterThan(200);
      expect(box!.height, `${name} height`).toBeGreaterThan(200);
    }

    // Place a pin.
    //
    // The target MOVES between attempts, and that is the whole trick. Clicking a
    // Google Maps place label fires a POI click that the map's own onClick never
    // sees, so retrying the same coordinate retries the same failure forever. The
    // centre of a Toronto-framed map is exactly where the "Toronto" label sits.
    // These offsets also stay clear of the zoom controls (bottom right) and the
    // attribution strip (bottom edge).
    const targets = [
      [0.3, 0.32],
      [0.68, 0.3],
      [0.5, 0.5],
      [0.25, 0.62],
      [0.42, 0.22],
    ] as const;
    const submit = page.getByTestId("submit-guess");
    let attempt = 0;
    await expect(async () => {
      const box = await map.boundingBox();
      const [fx, fy] = targets[attempt % targets.length]!;
      attempt += 1;
      await page.mouse.click(box!.x + box!.width * fx, box!.y + box!.height * fy);
      await expect(submit).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 40_000 });

    await submit.click();

    // The result arriving at all is the assertion that matters most here: the
    // guess carries the X-Play-Token header, so a real browser preflight had to
    // accept it. curl does not preflight, so nothing else checks that.
    const result = page.getByTestId("round-result");
    // The request check comes FIRST. When the guess call fails, the result card
    // simply never appears, and asserting on the card first reports "element not
    // visible" while the status code that explains it sits unread in `failures`.
    await expect(async () => {
      expect(failures, "gameplay requests failed").toEqual([]);
      await expect(result).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 25_000 });

    // ── The PR 39 regression ──────────────────────────────────────────────
    // A 256px prefetch surface dropped into normal flow and pushed the results
    // down. Measured as the gap between the top of the stage and the top of the
    // result card, which is a few px normally and was 272px during the bug.
    const stageBox = await page.getByTestId("game-stage").boundingBox();
    const resultBox = await result.boundingBox();
    expect(stageBox).not.toBeNull();
    expect(resultBox).not.toBeNull();

    const gap = resultBox!.y - stageBox!.y;
    expect(
      gap,
      `${Math.round(gap)}px between the stage and the result card; the PR 39 bug measured 272px`
    ).toBeLessThan(64);

    // And the stage itself still starts just under the nav.
    const stageOffset = stageBox!.y - (await navBottom(page));
    expect(stageOffset, "gap between the nav and the stage").toBeLessThan(64);

    // The prefetch surface, when present, must stay out of the flow entirely.
    // This is the node Maps rewrote, so asserting its position pins the actual
    // fix rather than only its most visible symptom.
    const prefetch = page.getByTestId("pano-prefetch");
    if ((await prefetch.count()) > 0) {
      const box = await prefetch.boundingBox();
      // Off screen to the left, or never rendered into the layout at all.
      expect(
        box === null || box.x + box.width <= 0,
        "the panorama prefetch is taking layout space"
      ).toBe(true);
    }

    expect(
      await pageOverflow(page),
      "horizontal page overflow on the results stage"
    ).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  });

  test("the stage fits a phone viewport without sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/game");
    await expect(page.getByTestId("game-panorama")).toBeVisible();

    expect(
      await pageOverflow(page),
      "horizontal page overflow at 390px"
    ).toBeLessThanOrEqual(OVERFLOW_TOLERANCE_PX);
  });
});

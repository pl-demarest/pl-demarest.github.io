import { test as base, expect, type Page } from '@playwright/test';

/** Fixed wall-clock start for every page; the clock is paused 1 s later. */
const CLOCK_START = new Date('2026-01-01T00:00:00Z');
const SEED = 1234;
/** Playwright's fake clock fires requestAnimationFrame every 16 ms. */
export const FRAME_MS = 16;

/**
 * Open the landing page with deterministic randomness and time.
 *
 * - Playwright's fake clock is installed and paused before navigation, so no
 *   requestAnimationFrame callback runs until the test advances time; the
 *   scene's loop (renderer.setAnimationLoop -> rAF) then runs only under
 *   page.clock.runFor, with rAF firing at multiples of 16 ms.
 * - The paused clock's performance.now() still starts at a value that varies
 *   between loads (1-7 ms measured), and SceneManager derives dt from
 *   performance.now(), so the first frame's dt would vary and node positions
 *   would differ by a fraction of a pixel. An init script registered after
 *   the clock (so it wraps the fake) quantizes performance.now() to the
 *   16 ms frame grid: every frame then has dt = 16 ms exactly.
 * - Math.random is replaced by mulberry32(SEED), so the particle field and
 *   three.js UUIDs are identical on every load.
 *
 * After loading, the scene runs for `settleMs` of fake time.
 */
export async function openScene(page: Page, settleMs = 2000): Promise<void> {
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 1000));
  // Registered after clock.install, so it runs after the fake clock is in place.
  await page.addInitScript(
    ({ seed, frameMs }: { seed: number; frameMs: number }) => {
      const fakeNow = performance.now.bind(performance);
      performance.now = () => Math.floor(fakeNow() / frameMs) * frameMs;

      let a = seed >>> 0;
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    { seed: SEED, frameMs: FRAME_MS },
  );
  await page.goto('/');
  await expect(page.locator('#info-panel .ip-category')).toHaveCount(3);
  await advance(page, settleMs);
}

/**
 * Advance the paused scene clock. `ms` must be a whole number of frames so
 * every load renders the same number of frames.
 */
export async function advance(page: Page, ms: number): Promise<void> {
  if (ms % FRAME_MS !== 0) throw new Error(`advance(${ms}): use a multiple of ${FRAME_MS} ms`);
  await page.clock.runFor(ms);
}

/**
 * Every test fails if the page throws or logs a console error. Console
 * warnings are allowed (software WebGL logs "GPU stall due to ReadPixels"
 * warnings whenever a screenshot reads the canvas).
 */
export const test = base.extend<{ failOnPageErrors: void }>({
  failOnPageErrors: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
      page.on('console', msg => {
        if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
      });
      await use();
      expect(problems, 'page errors and console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

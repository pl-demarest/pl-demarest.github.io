import { test as base, expect, type Page } from '@playwright/test';

/** Fixed wall-clock start for every page; the clock is paused 1 s later. */
const CLOCK_START = new Date('2026-01-01T00:00:00Z');
const SEED = 1234;
/**
 * Playwright's fake clock fires requestAnimationFrame every 16 ms of fake
 * time, at integer multiples of 16 ms (it has no fractional-millisecond
 * frames), so every duration passed to advance() is a whole number of these.
 */
export const FRAME_MS = 16;
/** The scene sees each 16 ms fake-clock frame as one 60 Hz frame (dt = 1/60 s). */
export const SCENE_FRAME_MS = 1000 / 60;

/**
 * Open the landing page with deterministic randomness and time.
 *
 * - Playwright's fake clock is installed and paused before navigation, so no
 *   requestAnimationFrame callback runs until the test advances time; the
 *   scene's loop (renderer.setAnimationLoop -> rAF) then runs only under
 *   page.clock.runFor, with rAF firing at multiples of 16 ms.
 * - SceneManager derives dt from performance.now(). An init script
 *   registered after the clock (so it wraps the fake) counts whole 16 ms
 *   fake-clock frames and reports frame k as k * 1000/60 ms. Every frame
 *   then has dt = 1/60 s, the step the unit-test characterization uses,
 *   and the paused clock's varying start offset (1-7 ms measured) cannot
 *   change the first frame's dt.
 * - The particle layout draws from its own mulberry32(SEED) stream, which
 *   App takes from window.__PARTICLE_RANDOM__. Math.random is replaced by
 *   another mulberry32(SEED), so three.js UUIDs are identical on every
 *   load too, and adding scene objects (each draws a UUID) does not move
 *   the particles.
 *
 * After loading, the scene runs for `settleMs` of fake time.
 */
export async function openScene(page: Page, settleMs = 2000): Promise<void> {
  await page.clock.install({ time: CLOCK_START });
  await page.clock.pauseAt(new Date(CLOCK_START.getTime() + 1000));
  // Registered after clock.install, so it runs after the fake clock is in place.
  await page.addInitScript(
    ({ seed, frameMs, sceneFrameMs }: { seed: number; frameMs: number; sceneFrameMs: number }) => {
      const fakeNow = performance.now.bind(performance);
      performance.now = () => Math.floor(fakeNow() / frameMs) * sceneFrameMs;

      const mulberry32 = (s: number) => {
        let a = s >>> 0;
        return () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      };
      Math.random = mulberry32(seed);
      window.__PARTICLE_RANDOM__ = mulberry32(seed);
    },
    { seed: SEED, frameMs: FRAME_MS, sceneFrameMs: SCENE_FRAME_MS },
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
 * Drag the mouse from `from` to `to` in `steps` moves with the main button
 * held, one frame apart, as a 60 Hz pointer sends them. The fake clock
 * holds Event.timeStamp between advance() calls, so moves sent without
 * advancing it all carry one timestamp, and the scene reads them as a
 * burst (it spins a dragged ring at the pointer's speed).
 */
export async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps: number,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await advance(page, FRAME_MS);
    await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
  }
  await page.mouse.up();
}

/**
 * Every test fails if the page throws or logs a console error. Console
 * warnings are allowed (software WebGL logs "GPU stall due to ReadPixels"
 * warnings whenever a screenshot reads the canvas). A test that provokes a
 * known error lists it in `allowedConsoleErrors`.
 */
export const test = base.extend<{ failOnPageErrors: void; allowedConsoleErrors: RegExp[] }>({
  allowedConsoleErrors: [[], { option: true }],
  failOnPageErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const problems: string[] = [];
      page.on('pageerror', err => problems.push(`pageerror: ${err.message}`));
      page.on('console', msg => {
        if (msg.type() !== 'error') return;
        if (allowedConsoleErrors.some(pattern => pattern.test(msg.text()))) return;
        problems.push(`console.error: ${msg.text()}`);
      });
      await use();
      expect(problems, 'page errors and console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

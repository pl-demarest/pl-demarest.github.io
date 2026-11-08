import { ORBITALS } from '../../src/scene/config';
import { FRAME_MS, advance, expect, openScene, test } from './support/fixtures';
import { SceneModel } from './support/geometry';

const VIEWPORT = { width: 375, height: 812 };

test.use({ viewport: VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

test.beforeEach(async ({ page }) => {
  await openScene(page, 2000);
});

test('the info panel is a bottom bar with the categories in one row', async ({ page }) => {
  const panel = page.locator('#info-panel');
  const box = (await panel.boundingBox())!;
  expect(box.x).toBe(0);
  expect(box.width).toBe(VIEWPORT.width);
  expect(Math.round(box.y + box.height)).toBe(VIEWPORT.height);

  const names = page.locator('.ip-category-name');
  await expect(names).toHaveText(ORBITALS.map(o => o.label));
  const boxes = await Promise.all((await names.all()).map(n => n.boundingBox()));
  const ys = boxes.map(b => Math.round(b!.y));
  expect(new Set(ys).size).toBe(1);
  const xs = boxes.map(b => b!.x);
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);

  const canvas = page.locator('#scene');
  await expect(canvas).toHaveAttribute('width', String(VIEWPORT.width));
  await expect(canvas).toHaveAttribute('height', String(VIEWPORT.height));
  await expect(page).toHaveScreenshot('mobile-idle.png');
});

test('tapping a category selects it and opens its nodes above the bar', async ({ page }) => {
  const projects = page.locator('.ip-category[data-ring-id="projects"]');
  await projects.locator('.ip-category-name').tap();
  await expect(projects).toHaveClass(/\bselected\b/);
  await expect(page.locator('.ip-category.selected')).toHaveCount(1);

  const nodes = projects.locator('.ip-nodes');
  await expect.poll(() => nodes.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(20);
  const panelTop = (await page.locator('#info-panel').boundingBox())!.y;
  const nodesBox = (await nodes.boundingBox())!;
  expect(nodesBox.y + nodesBox.height).toBeLessThanOrEqual(panelTop + 1);

  await advance(page, 1504);
  await expect(page).toHaveScreenshot('mobile-selected-projects.png');

  // A second tap deselects.
  await projects.locator('.ip-category-name').tap();
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
});

test('tapping a ring in the scene selects it', async ({ page }) => {
  // No hover precedes a tap, so the click must come from the ring under the press.
  // The margin keeps the point clear of the header and the bottom bar.
  const point = new SceneModel(VIEWPORT, 2000).ringPoint('projects', { margin: 90 });
  await page.touchscreen.tap(point.x, point.y);
  await expect(page.locator('.ip-category[data-ring-id="projects"]')).toHaveClass(/\bselected\b/);
  await expect(page.locator('.ip-category.selected')).toHaveCount(1);
});

test('a pinch that starts on the scene zooms the page', async ({ page }) => {
  // The canvas covers the window. With touch-action: none on it, no pinch
  // could zoom the page (the scale stayed 1); pinch-zoom leaves two-finger
  // gestures to the browser.
  const fingers = (gap: number) => [
    { id: 1, x: 187 - gap, y: 350 },
    { id: 2, x: 187 + gap, y: 350 },
  ];
  const onScene = await page.evaluate(
    points => points.map(p => document.elementFromPoint(p.x, p.y)?.id),
    fingers(20),
  );
  expect(onScene).toEqual(['scene', 'scene']);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(20) });
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(20); // the browser's gesture detector runs in real time
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(20 + i * 8) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => window.visualViewport!.scale)).toBeGreaterThan(1.5);
});

test('a one-finger drag on the scene still reaches the pointer layer', async ({ page }) => {
  // pinch-zoom allows no one-finger panning, so the browser does not take
  // the drag (touch-action: auto would cancel the pointer after two moves).
  const canvas = page.locator('#scene');
  await expect(canvas).toHaveCSS('touch-action', 'pinch-zoom');

  await page.evaluate(() => {
    const events: string[] = [];
    (window as unknown as { events: string[] }).events = events;
    const scene = document.getElementById('scene')!;
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      scene.addEventListener(type, e => events.push(`${e.type} ${(e as PointerEvent).pointerType}`));
    }
  });
  // Clear of the header and the bottom bar, with room for the 90 px drag.
  const start = new SceneModel(VIEWPORT, 2000).ringPoint('projects', { margin: 90, maxX: VIEWPORT.width - 130 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x, y: start.y }] });
  for (let i = 1; i <= 6; i++) {
    await advance(page, FRAME_MS);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + i * 15, y: start.y }] });
  }
  // The pointer layer holds the drag (InteractionManager shows 'grabbing' only then).
  await expect(canvas).toHaveCSS('cursor', 'grabbing');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(canvas).not.toHaveCSS('cursor', 'grabbing');

  const events = await page.evaluate(() => (window as unknown as { events: string[] }).events);
  expect(events).toEqual(['pointerdown touch', ...Array<string>(6).fill('pointermove touch'), 'pointerup touch']);
  // A drag is not a tap: nothing is selected.
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
});

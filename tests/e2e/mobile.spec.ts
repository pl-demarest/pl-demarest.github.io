import { ORBITALS } from '../../src/scene/config';
import { advance, expect, openScene, test } from './support/fixtures';

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

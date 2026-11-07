import type { Page } from '@playwright/test';
import { ORBITALS } from '../../src/scene/config';
import { advance, expect, openScene, test } from './support/fixtures';
import { SceneModel } from './support/geometry';

const VIEWPORT = { width: 1280, height: 800 };
const SETTLE_MS = 2000;
/** Bottom-left corner of the canvas: no ring or node there (checked in beforeAll). */
const EMPTY = { x: 60, y: 740 };

let model: SceneModel;

test.beforeAll(() => {
  model = new SceneModel(VIEWPORT, SETTLE_MS);
  expect(model.isEmpty(EMPTY)).toBe(true);
});

test.beforeEach(async ({ page }) => {
  await openScene(page, SETTLE_MS);
});

const category = (page: Page, id: string) =>
  page.locator(`#info-panel .ip-category[data-ring-id="${id}"]`);

test('boots with header, panel and a full-window canvas', async ({ page }) => {
  await expect(page).toHaveTitle('Phillip Demarest, PhD');
  await expect(page.locator('.header-name')).toHaveText('Phillip Demarest, PhD');
  await expect(page.locator('.header-link')).toHaveText(['About', 'Projects', 'Contact']);
  await expect(page.locator('.ip-category-name')).toHaveText(ORBITALS.map(o => o.label));
  const canvas = page.locator('#scene');
  await expect(canvas).toHaveAttribute('width', '1280');
  await expect(canvas).toHaveAttribute('height', '800');
  await expect(page.locator('.ip-category.selected, .ip-category.hovered')).toHaveCount(0);
  await expect(page).toHaveScreenshot('desktop-idle.png');
});

test('hovering near a category name expands its nodes', async ({ page }) => {
  const name = category(page, 'experiences').locator('.ip-category-name');
  const box = (await name.boundingBox())!;
  // 25 px left of the name: inside the inflated hover zone, not on the text.
  await page.mouse.move(box.x - 25, box.y + box.height / 2);
  await expect(category(page, 'experiences')).toHaveClass(/\bhovered\b/);
  const nodes = category(page, 'experiences').locator('.ip-nodes');
  await expect.poll(() => nodes.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(20);
  await expect(page.locator('.ip-category.hovered')).toHaveCount(1);

  await page.mouse.move(EMPTY.x, EMPTY.y);
  await expect(page.locator('.ip-category.hovered')).toHaveCount(0);
  await expect.poll(() => nodes.evaluate(el => el.getBoundingClientRect().height)).toBe(0);
});

for (const orbital of ORBITALS) {
  test(`clicking ${orbital.id} selects it and flattens its ring`, async ({ page }) => {
    await category(page, orbital.id).locator('.ip-category-name').click();
    await expect(category(page, orbital.id)).toHaveClass(/\bselected\b/);
    await expect(page.locator('.ip-category.selected')).toHaveCount(1);
    // The flat-view ease settles in under 40 frames (0.67 s at 60 Hz); run 94 frames.
    await advance(page, 1504);
    await expect(page).toHaveScreenshot(`desktop-selected-${orbital.id}.png`);
  });
}

test('clicking outside the panel deselects', async ({ page }) => {
  await category(page, 'projects').locator('.ip-category-name').click();
  await expect(category(page, 'projects')).toHaveClass(/\bselected\b/);
  await page.mouse.click(EMPTY.x, EMPTY.y);
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
});

test('dragging a ring changes the rendered scene and does not select it', async ({ page }) => {
  // Outer ring, left of the panel so the drag never crosses it.
  const start = model.ringPoint('projects', { maxX: 900 });
  const canvas = page.locator('#scene');
  const before = await canvas.screenshot();

  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y + 40, { steps: 6 });
  await page.mouse.up();
  await advance(page, 496);

  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
});

test('a still scene renders identically until time advances', async ({ page }) => {
  const canvas = page.locator('#scene');
  const a = await canvas.screenshot();
  await page.waitForTimeout(300); // real time passes; the fake clock does not
  const b = await canvas.screenshot();
  expect(b.equals(a)).toBe(true);
  await advance(page, 992);
  const c = await canvas.screenshot();
  expect(c.equals(a)).toBe(false);
});

test('hovering a scene node highlights its panel entry', async ({ page }) => {
  const target = model.nodePoint('papers');
  await page.mouse.move(target.x, target.y);
  const entry = page.locator('.ip-node[data-node-id="papers"]');
  await expect(entry).toHaveClass(/\bscene-hovered\b/);
  await expect(page.locator('.ip-node.scene-hovered')).toHaveCount(1);
  // The node's ring category expands from the scene side.
  await expect(category(page, 'publications')).toHaveClass(/\bhovered\b/);
  await expect(page.locator('#scene')).toHaveCSS('cursor', 'pointer');

  await page.mouse.move(EMPTY.x, EMPTY.y);
  await expect(page.locator('.ip-node.scene-hovered')).toHaveCount(0);
});

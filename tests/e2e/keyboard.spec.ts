import type { Locator, Page } from '@playwright/test';
import { SECTIONS } from '../../src/content/site';
import { expect, openScene, test } from './support/fixtures';

// Keyboard and screen-reader access to the panel in a real browser: Tab
// focus expands a category the way hover does, Enter and Space select,
// Escape clears, and collapsed node lists stay out of the accessibility tree.

const category = (page: Page, id: string) => page.locator(`#info-panel .ip-category[data-ring-id="${id}"]`);
const name = (page: Page, id: string) => category(page, id).locator('.ip-category-name');
const node = (page: Page, id: string) => page.locator(`#info-panel .ip-node[data-node-id="${id}"]`);

/** The focus ring's colour (style.css). */
const RING = [162, 127, 184];

type Side = 'top' | 'right' | 'bottom' | 'left';

/**
 * How much of each side of the focus ring around `target` shows in a
 * screenshot crop. The ring is 1 px wide and 2 px outside the element's
 * box; at fractional positions it is drawn across two pixel lines, as a
 * blend of its colour with the white page. For each point along a side,
 * the ring's coverage is summed over the 5 pixel lines outside the box;
 * the point shows the ring when the sum reaches 0.6. Returns, per side,
 * the share of points that show it, and the crop.
 */
async function focusRing(page: Page, target: Locator): Promise<{ sides: Record<Side, number>; crop: Buffer }> {
  const box = (await target.boundingBox())!;
  const margin = 8;
  const x = Math.floor(box.x) - margin;
  const y = Math.floor(box.y) - margin;
  const clip = { x, y, width: Math.ceil(box.x + box.width) + margin - x, height: Math.ceil(box.y + box.height) + margin - y };
  const crop = await page.screenshot({ clip });
  // Decoded by the browser: the suite has no PNG decoder of its own.
  const sides = await page.evaluate(
    async ({ base64, clip, box, ring }) => {
      const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      /** The ring colour's share in a pixel that blends it with white; 0 for any other colour. */
      const coverage = (px: number, py: number) => {
        if (px < 0 || py < 0 || px >= width || py >= height) return 0;
        const i = (py * width + px) * 4;
        const shares = [0, 1, 2].map(c => (255 - data[i + c]!) / (255 - ring[c]!));
        return Math.max(...shares) - Math.min(...shares) <= 0.15 ? shares.reduce((a, b) => a + b) / 3 : 0;
      };
      const left = box.x - clip.x;
      const right = box.x + box.width - clip.x;
      const top = box.y - clip.y;
      const bottom = box.y + box.height - clip.y;
      // Points along each side, corners excluded.
      const xs = Array.from({ length: Math.floor(right) - Math.ceil(left) }, (_, i) => Math.ceil(left) + i);
      const ys = Array.from({ length: Math.floor(bottom) - Math.ceil(top) }, (_, i) => Math.ceil(top) + i);
      const lines = [1, 2, 3, 4, 5];
      const shows = (sum: number) => sum >= 0.6;
      const share = (along: number[], at: (t: number, d: number) => number) =>
        along.filter(t => shows(lines.reduce((sum, d) => sum + at(t, d), 0))).length / along.length;
      return {
        top: share(xs, (px, d) => coverage(px, Math.floor(top) - d)),
        bottom: share(xs, (px, d) => coverage(px, Math.ceil(bottom) - 1 + d)),
        left: share(ys, (py, d) => coverage(Math.floor(left) - d, py)),
        right: share(ys, (py, d) => coverage(Math.ceil(right) - 1 + d, py)),
      };
    },
    { base64: crop.toString('base64'), clip, box, ring: RING },
  );
  return { sides, crop };
}

test.beforeEach(async ({ page }) => {
  await openScene(page, 160);
});

test('Tab walks the categories and the nodes of the expanded one', async ({ page }) => {
  await page.locator('.header-link').last().focus();
  await page.keyboard.press('Tab');
  await expect(name(page, 'publications')).toBeFocused();
  await expect(category(page, 'publications')).toHaveClass(/\bhovered\b/);
  await expect(name(page, 'publications')).toHaveAttribute('aria-expanded', 'true');
  await expect(name(page, 'experiences')).toHaveAttribute('aria-expanded', 'false');

  for (const id of ['papers', 'patents', 'presentations']) {
    await page.keyboard.press('Tab');
    await expect(node(page, id)).toBeFocused();
  }
  // Collapsed categories keep their nodes out of the way.
  await page.keyboard.press('Tab');
  await expect(name(page, 'experiences')).toBeFocused();
  await expect(page.locator('.ip-category.hovered')).toHaveCount(1);
  await expect(category(page, 'experiences')).toHaveClass(/\bhovered\b/);
  await expect(name(page, 'publications')).toHaveAttribute('aria-expanded', 'false');
});

test('Enter and Space select, Escape clears and leaves the focused category open', async ({ page }) => {
  await name(page, 'experiences').focus();
  await page.keyboard.press('Enter');
  await expect(category(page, 'experiences')).toHaveClass(/\bselected\b/);
  await expect(page.locator('.ip-category.selected')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
  await expect(category(page, 'experiences')).toHaveClass(/\bhovered\b/);

  await page.keyboard.press('Space');
  await expect(category(page, 'experiences')).toHaveClass(/\bselected\b/);
  await page.keyboard.press('Space');
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
});

test('a pointer move does not collapse the category that holds keyboard focus', async ({ page }) => {
  await page.locator('.header-link').last().focus();
  await page.keyboard.press('Tab'); // Publications
  await page.keyboard.press('Tab'); // Papers
  await expect(node(page, 'papers')).toBeFocused();
  await expect(category(page, 'publications')).toHaveClass(/\bhovered\b/);

  // The mouse moves over the scene, away from the panel: the focused node
  // button must stay visible and in the tab order.
  await page.mouse.move(400, 700);

  await expect(node(page, 'papers')).toBeFocused();
  await expect(category(page, 'publications')).toHaveClass(/\bhovered\b/);
  await expect(node(page, 'papers')).toHaveAttribute('tabindex', '0');
});

test('a focused node button shows its focus ring on all four sides', async ({ page }, testInfo) => {
  // The node list clips its overflow, and on desktop the node buttons span
  // its full width: a ring outside a button's box lost its sides there.
  await page.locator('.header-link').last().focus();
  await page.keyboard.press('Tab'); // the first category's name
  for (const { id } of SECTIONS[0]!.nodes) {
    await page.keyboard.press('Tab');
    await expect(node(page, id)).toBeFocused();
    await page.waitForFunction(() => document.getAnimations().length === 0);
    const { sides, crop } = await focusRing(page, node(page, id));
    await testInfo.attach(`${id} focus ring`, { body: crop, contentType: 'image/png' });
    const missing = Object.entries(sides).filter(([, share]) => share < 0.9);
    expect.soft(missing, `${id}: sides of the focus ring that do not show, with the share that does`).toEqual([]);
  }
});

test('collapsed categories keep their node buttons out of the accessibility tree', async ({ page }) => {
  await expect(page.locator('#info-panel')).toMatchAriaSnapshot(`
    - navigation "Sections":
      - /children: equal
      - button "Publications"
      - button "Experiences"
      - button "Projects"
  `);
  // An expanded category shows its nodes.
  await page.locator('.header-link').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#info-panel')).toMatchAriaSnapshot(`
    - navigation "Sections":
      - /children: equal
      - button "Publications" [expanded]
      - button "Papers"
      - button "Patents"
      - button "Presentations"
      - button "Experiences"
      - button "Projects"
  `);
});

test('a node focused by a click hands focus to its category name when the category collapses', async ({ page }) => {
  // The pointer hovers Experiences from beside its name, and a click on a
  // node focuses the node (focus without :focus-visible).
  const box = (await name(page, 'experiences').boundingBox())!;
  await page.mouse.move(box.x - 25, box.y + box.height / 2);
  await expect(category(page, 'experiences')).toHaveClass(/\bhovered\b/);
  await node(page, 'academic').click();
  await expect(node(page, 'academic')).toBeFocused();

  // The pointer leaves the panel. The category collapses and its node list
  // leaves the accessibility tree, so focus moves to the category's name.
  await page.mouse.move(400, 700);
  await expect(category(page, 'experiences')).not.toHaveClass(/\bhovered\b/);
  await expect(page.locator('#ip-nodes-experiences')).toHaveAttribute('aria-hidden', 'true');
  await expect(name(page, 'experiences')).toBeFocused();
});

test('focus that follows a mouse click does not act as a hover', async ({ page }) => {
  await name(page, 'publications').click();
  // Over the selected category's first node, the nearest other name
  // (experiences, just below) is hovered.
  await node(page, 'papers').hover();
  await expect(category(page, 'experiences')).toHaveClass(/\bhovered\b/);
  // Clicking the node focuses it; that focus must not take the hover away.
  await node(page, 'papers').click();
  await expect(node(page, 'papers')).toBeFocused();
  await expect(category(page, 'experiences')).toHaveClass(/\bhovered\b/);
  await expect(category(page, 'publications')).toHaveClass(/\bselected\b/);
});

import type { Page } from '@playwright/test';
import { expect, openScene, test } from './support/fixtures';

// Keyboard access to the panel in a real browser: Tab focus expands a
// category the way hover does, Enter and Space select, Escape clears.

const category = (page: Page, id: string) => page.locator(`#info-panel .ip-category[data-ring-id="${id}"]`);
const name = (page: Page, id: string) => category(page, id).locator('.ip-category-name');
const node = (page: Page, id: string) => page.locator(`#info-panel .ip-node[data-node-id="${id}"]`);

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

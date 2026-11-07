import { expect, openScene, test } from '../support/fixtures';

// Gap found by mutation testing (2026-11-07): the browser suite runs at
// 375 px and 1280 px only, so moving the CSS mobile breakpoint anywhere in
// between went undetected, and the desktop panel offset was pinned only
// through pixel screenshots. These checks sit on both sides of the 767/768
// edge and read the panel box directly.

const HEIGHT = 900;

for (const width of [767, 768]) {
  test.describe(`at ${width} px`, () => {
    test.use({ viewport: { width, height: HEIGHT } });

    test.beforeEach(async ({ page }) => {
      await openScene(page, 160);
    });

    test(width < 768 ? 'the panel is a full-width bottom bar' : 'the panel is a right-hand column 2rem from the edge', async ({ page }) => {
      const box = (await page.locator('#info-panel').boundingBox())!;
      const names = await Promise.all((await page.locator('.ip-category-name').all()).map(n => n.boundingBox()));
      const ys = new Set(names.map(b => Math.round(b!.y)));
      if (width < 768) {
        expect(box.x).toBe(0);
        expect(box.width).toBe(width);
        expect(Math.round(box.y + box.height)).toBe(HEIGHT);
        expect(ys.size).toBe(1);
      } else {
        expect(Math.round(box.x + box.width)).toBe(width - 32);
        expect(Math.abs(box.y + box.height / 2 - HEIGHT / 2)).toBeLessThanOrEqual(1);
        expect(ys.size).toBe(names.length);
      }
    });
  });
}

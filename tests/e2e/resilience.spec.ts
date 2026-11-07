import { advance, expect, openScene, test } from './support/fixtures';

// The page without WebGL, and with reduced motion.

test.describe('without WebGL', () => {
  // three.js logs this before App catches the failure.
  test.use({ allowedConsoleErrors: [/Error creating WebGL context/] });

  test('the header and the panel still work, and a notice says the 3D view is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        value(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          if (type === 'webgl2' || type === 'webgl') return null;
          return Reflect.apply(getContext, this, [type, ...rest]);
        },
      });
    });
    await openScene(page, 160);

    await expect(page.locator('.scene-notice')).toHaveText('The 3D view could not start in this browser.');
    await expect(page.locator('.header-name')).toHaveText('Phillip Demarest, PhD');
    const projects = page.locator('.ip-category[data-ring-id="projects"]');
    await projects.locator('.ip-category-name').click();
    await expect(projects).toHaveClass(/\bselected\b/);
    await page.keyboard.press('Escape');
    await expect(page.locator('.ip-category.selected')).toHaveCount(0);
  });
});

test.describe('reduced motion', () => {
  test('the scene holds still and panel transitions are short', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScene(page, 160);
    const canvas = page.locator('#scene');
    const before = await canvas.screenshot();
    await advance(page, 992);
    expect((await canvas.screenshot()).equals(before)).toBe(true);

    const durations = await page
      .locator('.ip-category-name')
      .first()
      .evaluate(el => getComputedStyle(el).transitionDuration);
    expect(durations.split(',').map(d => d.trim())).toEqual(['0.05s']);
  });

  test('turning it on pauses a moving scene', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openScene(page, 160);
    const canvas = page.locator('#scene');
    const moving = await canvas.screenshot();
    await advance(page, 160);
    expect((await canvas.screenshot()).equals(moving)).toBe(false);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await advance(page, 16);
    const paused = await canvas.screenshot();
    await advance(page, 496);
    expect((await canvas.screenshot()).equals(paused)).toBe(true);
  });
});

import { advance, expect, openScene, test } from './support/fixtures';
import { readScene } from './support/sceneProbe';

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

  test('a click on the page background clears the selection', async ({ page }) => {
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
    await expect(page.locator('.scene-notice')).toBeVisible();

    const projects = page.locator('.ip-category[data-ring-id="projects"]');
    await projects.locator('.ip-category-name').click();
    await expect(projects).toHaveClass(/\bselected\b/);

    // Page background (the canvas, with no scene on it), clear of the
    // header, the panel and the notice.
    await page.mouse.click(300, 600);
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

  test('selecting a section snaps its ring flat instead of animating it', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openScene(page, 160);
    await page.locator('.ip-category[data-ring-id="projects"] .ip-category-name').click();
    // Move off the panel, to empty canvas: the selected category's node list
    // expands under a pointer resting on its name, and hovering a node row
    // would change the scene by itself.
    await page.mouse.move(60, 740);
    await expect(page.locator('.ip-node.scene-hovered')).toHaveCount(0);
    // One frame after the selection the ring lies exactly flat...
    await advance(page, 16);
    const first = await readScene(page);
    expect(first.rings['projects']).toEqual({ rotationX: Math.PI / 2, rotationZ: 0 });
    // ...and over the next 62 frames no ring turns or tilts and no node moves or grows.
    await advance(page, 992);
    expect(await readScene(page)).toEqual(first);
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

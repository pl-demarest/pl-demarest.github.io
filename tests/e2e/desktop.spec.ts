import type { Page } from '@playwright/test';
import { ORBITALS } from '../../src/scene/config';
import { FRAME_MS, SCENE_FRAME_MS, advance, drag, expect, openScene, test } from './support/fixtures';
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

  await drag(page, start, { x: start.x + 120, y: start.y + 40 }, 6);
  await advance(page, 496);

  const after = await canvas.screenshot();
  expect(after.equals(before)).toBe(false);
  await expect(page.locator('.ip-category.selected')).toHaveCount(0);
});

test('a drag across the panel does not hover its categories', async ({ page }) => {
  // The panel is centred vertically, so a category that expands moves the
  // names: measure them once its transitions have finished.
  const settled = () => page.waitForFunction(() => document.getAnimations().length === 0);
  const nameCentre = async (id: string) => {
    await settled();
    const box = (await category(page, id).locator('.ip-category-name').boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const start = model.ringPoint('projects', { maxX: 900 });
  await page.mouse.move(start.x, start.y);
  await expect(category(page, 'projects')).toHaveClass(/\bhovered\b/); // the scene's ring hover
  const name = await nameCentre('publications');
  await page.mouse.down();
  // Onto the publications name, one 60 Hz frame per move. The scene holds
  // the pointer captured, so every move still drags the ring.
  for (let i = 1; i <= 8; i++) {
    await advance(page, FRAME_MS);
    await page.mouse.move(start.x + ((name.x - start.x) * i) / 8, start.y + ((name.y - start.y) * i) / 8);
  }
  await expect(page.locator('#scene')).toHaveCSS('cursor', 'grabbing');
  await expect(category(page, 'publications')).not.toHaveClass(/\bhovered\b/);
  await expect(page.locator('.ip-category.hovered')).toHaveCount(1);

  // After the release the panel hovers under the pointer again.
  await page.mouse.up();
  const again = await nameCentre('publications');
  await page.mouse.move(again.x, again.y);
  await expect(category(page, 'publications')).toHaveClass(/\bhovered\b/);
});

test('a press whose release never reaches the page does not keep dragging', async ({ page }) => {
  const start = model.ringPoint('projects', { maxX: 800 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x, y: start.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 });
  await expect(page.locator('#scene')).toHaveCSS('cursor', 'grabbing');

  // The button is let go outside the browser; later moves report no buttons.
  for (let i = 1; i <= 3; i++) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: start.x + i * 30, y: start.y, button: 'none', buttons: 0 });
  }
  await expect(page.locator('#scene')).not.toHaveCSS('cursor', 'grabbing');

  // Hover picking works again (the clock is paused, so the scene has not moved).
  const node = model.nodePoint('papers');
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: node.x, y: node.y, button: 'none', buttons: 0 });
  await expect(page.locator('.ip-node.scene-hovered')).toHaveCount(1);
});

test('a synthetic press with no active pointer behind it still presses, without a page error', async ({ page }) => {
  // Chrome's setPointerCapture throws NotFoundError for a pointer id that
  // has no active pointer, as for this script-made event. The failOnPageErrors
  // fixture fails the test if that error escapes the handler.
  const p = model.ringPoint('projects', { maxX: 900 });
  const dispatch = (type: string, buttons: number) =>
    page.evaluate(
      ({ type, buttons, x, y }) => {
        const init = { clientX: x, clientY: y, pointerId: 999, pointerType: 'mouse', isPrimary: true, button: 0, buttons };
        document.getElementById('scene')!.dispatchEvent(new PointerEvent(type, { ...init, bubbles: true }));
      },
      { type, buttons, ...p },
    );
  await dispatch('pointerdown', 1);
  await expect(page.locator('#scene')).toHaveCSS('cursor', 'grabbing');
  await dispatch('pointerup', 0);
  // A press and release in place on a ring is a click on it.
  await expect(category(page, 'projects')).toHaveClass(/\bselected\b/);
  await expect(page.locator('#scene')).not.toHaveCSS('cursor', 'grabbing');
});

test('a drag sends its pointer moves one 60 Hz frame apart, as a real pointer does', async ({ page }) => {
  // InteractionManager spins a dragged ring at the pointer's speed, read
  // from the event timestamps. Moves that share one timestamp read as a
  // burst and spin the ring 4 times too fast (MIN_EVENT_INTERVAL).
  await page.evaluate(() => {
    const stamps: number[] = [];
    (window as unknown as { stamps: number[] }).stamps = stamps;
    document.getElementById('scene')!.addEventListener('pointermove', e => {
      if (e.buttons === 1) stamps.push(e.timeStamp);
    });
  });
  const start = model.ringPoint('projects', { maxX: 900 });
  await drag(page, start, { x: start.x + 120, y: start.y + 40 }, 6);
  const stamps = await page.evaluate(() => (window as unknown as { stamps: number[] }).stamps);
  expect(stamps).toHaveLength(6);
  const intervals = stamps.slice(1).map((t, i) => t - stamps[i]!);
  for (const interval of intervals) expect(interval).toBeCloseTo(SCENE_FRAME_MS, 6);
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

test('picking follows the canvas when it changes size without a window resize', async ({ page }) => {
  // A pick at full size measures the canvas and keeps its rect.
  await page.mouse.move(EMPTY.x, EMPTY.y);
  // The canvas shows the scene at half size in the top-left corner: a layout
  // change, with no window resize or scroll. The drawing buffer and the
  // camera stay as they are, so each point of the scene halves its position.
  await page.evaluate(async () => {
    const canvas = document.getElementById('scene')!;
    canvas.style.width = '640px';
    canvas.style.height = '400px';
    // Observers are notified in creation order, so the scene's own observer
    // has run by the time this one reports the new size.
    await new Promise<void>(resolve => {
      const observer = new ResizeObserver(() => {
        observer.disconnect();
        resolve();
      });
      observer.observe(canvas);
    });
  });
  const target = model.nodePoint('papers');
  await page.mouse.move(target.x / 2, target.y / 2);
  await expect(page.locator('.ip-node[data-node-id="papers"]')).toHaveClass(/\bscene-hovered\b/);
  await expect(page.locator('#scene')).toHaveCSS('cursor', 'pointer');
});

test('moving from a scene node onto the header clears the scene hover', async ({ page }) => {
  const target = model.nodePoint('papers');
  await page.mouse.move(target.x, target.y);
  await expect(page.locator('.ip-node.scene-hovered')).toHaveCount(1);
  await expect(category(page, 'publications')).toHaveClass(/\bhovered\b/);

  const name = (await page.locator('.header-name').boundingBox())!;
  await page.mouse.move(name.x + 5, name.y + name.height / 2);
  await expect(page.locator('.ip-node.scene-hovered')).toHaveCount(0);
  await expect(page.locator('.ip-category.hovered')).toHaveCount(0);
});

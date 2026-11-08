// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from '../../../src/app/store';
import { SECTIONS } from '../../../src/content/site';
import { ORBITALS } from '../../../src/scene/config';
import { InfoPanel } from '../../../src/ui/InfoPanel';
import { setViewport } from './viewport';

// Gaps found by mutation testing (2026-11-07): the existing pointermove test
// probes the hover zones at interior points only, so widening or narrowing
// any inflate constant, the 4 px right margin of a name hit, the 48 px
// mobile top inflation, or the mobile nearest-name axis (x, not y) went
// undetected. These tests probe each edge on both sides. happy-dom has no
// layout, so the panel and name rects are fixed by stubbing
// getBoundingClientRect before the first pointermove measures them.

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

function setup(): { root: HTMLElement; panel: InfoPanel } {
  document.body.innerHTML = '<div id="info-panel"></div>';
  const root = document.getElementById('info-panel')!;
  return { root, panel: new InfoPanel(root, SECTIONS, new Store()) };
}

function stubLayout(root: HTMLElement, panel: DOMRect, names: DOMRect[]): void {
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(panel);
  ORBITALS.forEach((o, i) => {
    const name = root.querySelector<HTMLElement>(`.ip-category[data-ring-id="${o.id}"] .ip-category-name`)!;
    vi.spyOn(name, 'getBoundingClientRect').mockReturnValue(names[i]!);
  });
}

const move = (x: number, y: number) =>
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));

const hovered = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.ip-category.hovered')].map(c => c.dataset['ringId']);

describe('info panel hover-zone edges', () => {
  let root: HTMLElement;
  let panel: InfoPanel;
  beforeEach(() => {
    ({ root, panel } = setup());
  });
  afterEach(() => {
    panel.dispose();
    document.body.innerHTML = '';
    setViewport(1024, 768);
  });

  describe('desktop (1024 px)', () => {
    // Panel 900..1000 x 300..390. Names 940..980 wide, 20 px tall, 30 px apart:
    // publications 300..320, experiences 330..350, projects 360..380.
    beforeEach(() => {
      stubLayout(
        root,
        rect(900, 300, 100, 90),
        ORBITALS.map((_, i) => rect(940, 300 + i * 30, 40, 20)),
      );
    });

    it('the panel zone extends 60 px left and 12 px above and below, and no further', () => {
      const probes: Array<[number, number, string[]]> = [
        [840, 345, ['experiences']],
        [839, 345, []],
        [950, 288, ['publications']],
        [950, 287, []],
        [950, 402, ['projects']],
        [950, 403, []],
        [1000, 345, ['experiences']],
        [1001, 345, []],
      ];
      for (const [x, y, expected] of probes) {
        move(500, 100); // outside: clears any panel hover
        expect(hovered(root)).toEqual([]);
        move(x, y);
        expect(hovered(root), `(${x}, ${y})`).toEqual(expected);
      }
    });

    it('with a category hovered, a name hit extends 40 px left, 4 px right and 6 px vertically', () => {
      move(950, 310);
      expect(hovered(root)).toEqual(['publications']);

      move(899, 370); // 41 px left of the projects name
      expect(hovered(root)).toEqual(['publications']);
      move(900, 370);
      expect(hovered(root)).toEqual(['projects']);

      move(985, 340); // 5 px right of the experiences name
      expect(hovered(root)).toEqual(['projects']);
      move(984, 340);
      expect(hovered(root)).toEqual(['experiences']);

      move(950, 387); // 7 px below the projects name
      expect(hovered(root)).toEqual(['experiences']);
      move(950, 386);
      expect(hovered(root)).toEqual(['projects']);
    });
  });

  describe('mobile (375 px)', () => {
    // Bottom bar 0..375 x 760..812; names side by side, 125 px slots.
    beforeEach(() => {
      setViewport(375, 812);
      stubLayout(
        root,
        rect(0, 760, 375, 52),
        ORBITALS.map((_, i) => rect(i * 125 + 20, 775, 85, 20)),
      );
    });

    it('the panel zone extends 48 px above the bar', () => {
      move(60, 712);
      expect(hovered(root)).toEqual(['publications']);
      move(60, 500);
      expect(hovered(root)).toEqual([]);
      move(60, 711);
      expect(hovered(root)).toEqual([]);
    });

    it('an open node list above the bar is part of the zone, beyond the 48 px', () => {
      // Publications' three rows open above the bar: Presentations 9.6-31.0,
      // Patents 31.0-52.4 and Papers 52.4-73.8 px above it, under 9.6 px of
      // padding (Chrome at 375 x 812).
      const list = root.querySelector<HTMLElement>('#ip-nodes-publications')!;
      vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(rect(0, 760 - 83.4, 375, 83.4));
      move(60, 785); // on the Publications name
      expect(hovered(root)).toEqual(['publications']);
      for (const above of [20.3, 41.7, 63.1, 80]) {
        move(60, 760 - above);
        expect(hovered(root), `${above} px above the bar`).toEqual(['publications']);
      }
      move(60, 760 - 90); // above the list
      expect(hovered(root)).toEqual([]);
    });

    it('the nearest name is chosen along x', () => {
      // Every name has the same y, so a y-distance pick would always return
      // the first category.
      move(330, 780);
      expect(hovered(root)).toEqual(['projects']);
      move(60, 500);
      move(190, 780);
      expect(hovered(root)).toEqual(['experiences']);
    });
  });
});

// @vitest-environment happy-dom
import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindScene } from '../../src/app/sceneBinding';
import { Store } from '../../src/app/store';
import { SECTIONS } from '../../src/content/site';
import type { SiteNode } from '../../src/content/types';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ORBITALS } from '../../src/scene/config';
import { InfoPanel } from '../../src/ui/InfoPanel';

// The panel renders from the store, and bindScene renders the same store
// onto real rings, so a panel action can be checked in the scene. happy-dom
// has no layout: tests that need positions stub getBoundingClientRect.

const HIGHLIGHT = 0xa27fb8;
const PAGE =
  '<header id="header"><a href="#" class="header-link">About</a></header>' +
  '<canvas id="scene"></canvas><div id="info-panel"></div>';

interface Ctx {
  panel: InfoPanel;
  store: Store;
  rings: OrbitalRing[];
  root: HTMLElement;
  canvas: HTMLElement;
  activated: SiteNode[];
}

function setup(): Ctx {
  document.body.innerHTML = PAGE;
  const root = document.getElementById('info-panel')!;
  const canvas = document.getElementById('scene')!;
  const store = new Store();
  const rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
  bindScene(store, rings);
  const activated: SiteNode[] = [];
  const panel = new InfoPanel(root, SECTIONS, store, {
    sceneElement: canvas,
    onNodeActivate: node => activated.push(node),
  });
  return { panel, store, rings, root, canvas, activated };
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

function category(root: HTMLElement, ringId: string): HTMLElement {
  return root.querySelector<HTMLElement>(`.ip-category[data-ring-id="${ringId}"]`)!;
}

function nameButton(root: HTMLElement, ringId: string): HTMLButtonElement {
  return category(root, ringId).querySelector<HTMLButtonElement>('.ip-category-name')!;
}

function nodeButton(root: HTMLElement, nodeId: string): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(`.ip-node[data-node-id="${nodeId}"]`)!;
}

function nodeColor(ring: OrbitalRing, i: number): number {
  return (ring.nodes[i]!.mesh.material as THREE.MeshBasicMaterial).color.getHex();
}

const hovered = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.ip-category.hovered')].map(c => c.dataset['ringId']);

const move = (x: number, y: number) =>
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));

/** The node buttons in the tab order, by node id. */
const tabbable = () =>
  [...document.querySelectorAll<HTMLButtonElement>('#info-panel .ip-node')].filter(b => b.tabIndex >= 0).map(b => b.dataset['nodeId']);

/** Shift+Tab's keydown; happy-dom does not move focus for it, as a browser then does. */
const shiftTab = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));

describe('InfoPanel', () => {
  let ctx: Ctx;

  beforeEach(() => {
    ctx = setup();
  });
  afterEach(() => {
    ctx.panel.dispose();
    document.body.innerHTML = '';
  });

  it('renders one category per section with its nodes, in content order', () => {
    const cats = [...ctx.root.querySelectorAll<HTMLElement>('.ip-category')];
    expect(cats.map(c => c.dataset['ringId'])).toEqual(SECTIONS.map(s => s.id));
    expect(cats.map(c => c.querySelector('.ip-category-name')!.textContent)).toEqual(SECTIONS.map(s => s.label));
    cats.forEach((cat, i) => {
      const nodes = [...cat.querySelectorAll<HTMLElement>('.ip-nodes > .ip-node')];
      expect(nodes.map(n => n.dataset['nodeId'])).toEqual(SECTIONS[i]!.nodes.map(n => n.id));
      expect(nodes.map(n => n.textContent)).toEqual(SECTIONS[i]!.nodes.map(n => n.label));
    });
    expect(ctx.root.querySelector('.selected, .hovered')).toBeNull();
  });

  it('makes categories and nodes buttons; aria-expanded follows hover and selection', () => {
    for (const section of SECTIONS) {
      const name = nameButton(ctx.root, section.id);
      expect(name.tagName).toBe('BUTTON');
      expect(name.type).toBe('button');
      const list = document.getElementById(name.getAttribute('aria-controls')!)!;
      expect(list.classList.contains('ip-nodes')).toBe(true);
      expect(category(ctx.root, section.id).contains(list)).toBe(true);
      expect(name.getAttribute('aria-expanded')).toBe('false');
      for (const node of section.nodes) expect(nodeButton(ctx.root, node.id).tagName).toBe('BUTTON');
    }
    ctx.store.hoverRing('experiences', 'scene');
    expect(nameButton(ctx.root, 'experiences').getAttribute('aria-expanded')).toBe('true');
    ctx.store.toggleSelection('projects');
    expect(nameButton(ctx.root, 'projects').getAttribute('aria-expanded')).toBe('true');
    ctx.store.hoverRing(null, 'scene');
    expect(nameButton(ctx.root, 'experiences').getAttribute('aria-expanded')).toBe('false');
  });

  it('puts node buttons in the tab order only while their category is selected or holds keyboard focus', () => {
    expect(tabbable()).toEqual([]);
    // A hover from the pointer or the scene expands a category; the tab
    // order does not follow it.
    ctx.store.hoverRing('experiences', 'panel');
    expect(nameButton(ctx.root, 'experiences').getAttribute('aria-expanded')).toBe('true');
    expect(tabbable()).toEqual([]);
    ctx.store.hoverRing('projects', 'scene');
    expect(tabbable()).toEqual([]);
    ctx.store.toggleSelection('publications');
    expect(tabbable()).toEqual(['papers', 'patents', 'presentations']);
    nameButton(ctx.root, 'experiences').focus(); // keyboard focus
    expect(tabbable()).toEqual(['papers', 'patents', 'presentations', 'academic', 'professional']);
  });

  it('hides the node lists of collapsed categories from assistive technology', () => {
    const hidden = () =>
      SECTIONS.filter(s => document.getElementById(`ip-nodes-${s.id}`)!.getAttribute('aria-hidden') === 'true').map(s => s.id);
    expect(hidden()).toEqual(['publications', 'experiences', 'projects']);
    ctx.store.hoverRing('experiences', 'scene');
    expect(hidden()).toEqual(['publications', 'projects']);
    ctx.store.toggleSelection('projects');
    expect(hidden()).toEqual(['publications']);
    expect(document.getElementById('ip-nodes-experiences')!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('clicking a category selects it, flattens its ring and highlights its nodes', () => {
    const ring = ctx.rings[1]!;
    nameButton(ctx.root, ring.config.id).click();
    expect(category(ctx.root, ring.config.id).classList.contains('selected')).toBe(true);
    expect(ring.isFlatMode).toBe(true);
    expect(ring.angularVelocity).toBe(0);
    ring.nodes.forEach((_, i) => expect(nodeColor(ring, i)).toBe(HIGHLIGHT));
    for (const other of ctx.rings.filter(r => r !== ring)) {
      expect(other.isFlatMode).toBe(false);
      expect(category(ctx.root, other.config.id).classList.contains('selected')).toBe(false);
    }
  });

  it('a second click on the same category deselects it', () => {
    const ring = ctx.rings[0]!;
    nameButton(ctx.root, ring.config.id).click();
    nameButton(ctx.root, ring.config.id).click();
    expect(category(ctx.root, ring.config.id).classList.contains('selected')).toBe(false);
    expect(ring.isFlatMode).toBe(false);
    expect(ring.angularVelocity).toBe(ring.returnSpeed);
    ring.nodes.forEach((_, i) => expect(nodeColor(ring, i)).toBe(0x000000));
  });

  it('clicking another category moves the selection', () => {
    const [a, b] = ctx.rings as [OrbitalRing, OrbitalRing];
    nameButton(ctx.root, a.config.id).click();
    nameButton(ctx.root, b.config.id).click();
    expect(a.isFlatMode).toBe(false);
    expect(b.isFlatMode).toBe(true);
    expect(ctx.root.querySelectorAll('.ip-category.selected')).toHaveLength(1);
    expect(category(ctx.root, b.config.id).classList.contains('selected')).toBe(true);
  });

  it('a click outside the panel and the scene clears the selection', () => {
    const ring = ctx.rings[2]!;
    nameButton(ctx.root, ring.config.id).click();
    document.querySelector<HTMLElement>('.header-link')!.click();
    expect(ctx.root.querySelector('.ip-category.selected')).toBeNull();
    expect(ring.isFlatMode).toBe(false);
  });

  it('a selection made in the scene survives the click that caused it', () => {
    // The scene's pointerup toggles the selection; the browser then sends a
    // click to the canvas. Clicks on the scene's element are the scene's.
    const ring = ctx.rings[0]!;
    ctx.store.toggleSelection(ring.config.id);
    ctx.canvas.click();
    expect(ring.isFlatMode).toBe(true);
    ctx.canvas.click();
    expect(ring.isFlatMode).toBe(true);
    // A click inside the panel keeps it as well; one outside both clears it.
    nodeButton(ctx.root, 'academic').click();
    expect(ring.isFlatMode).toBe(true);
    document.body.click();
    expect(ring.isFlatMode).toBe(false);
  });

  it('a scene ring hover expands the ring category and clears it on null', () => {
    const ring = ctx.rings[1]!;
    ctx.store.hoverRing(ring.config.id, 'scene');
    expect(category(ctx.root, ring.config.id).classList.contains('hovered')).toBe(true);
    ctx.store.hoverRing(null, 'scene');
    expect(ctx.root.querySelector('.ip-category.hovered')).toBeNull();
  });

  it('a scene ring hover does not mark the selected category as hovered', () => {
    const ring = ctx.rings[1]!;
    nameButton(ctx.root, ring.config.id).click();
    ctx.store.hoverRing(ring.config.id, 'scene');
    expect(category(ctx.root, ring.config.id).classList.contains('hovered')).toBe(false);
  });

  it('a scene node hover marks exactly one panel node and clears on null', () => {
    const marked = () =>
      [...ctx.root.querySelectorAll<HTMLElement>('.ip-node.scene-hovered')].map(n => n.dataset['nodeId']);
    ctx.store.hoverNode('patents', 'scene');
    expect(marked()).toEqual(['patents']);
    ctx.store.hoverNode('code', 'scene');
    expect(marked()).toEqual(['code']);
    ctx.store.hoverNode(null, 'scene');
    expect(marked()).toEqual([]);
    // A row hovered from the panel uses its own :hover style instead.
    ctx.store.hoverNode('code', 'panel');
    expect(marked()).toEqual([]);
  });

  it('pointer enter and leave on a panel node hover the scene node', () => {
    const ring = ctx.rings[0]!;
    const el = nodeButton(ctx.root, 'papers');
    el.dispatchEvent(new PointerEvent('pointerenter'));
    expect(nodeColor(ring, 0)).toBe(HIGHLIGHT);
    el.dispatchEvent(new PointerEvent('pointerleave'));
    expect(nodeColor(ring, 0)).toBe(0x000000);
  });

  it('activating a node button reports its node and leaves the selection alone', () => {
    nodeButton(ctx.root, 'code').click();
    expect(ctx.activated.map(n => n.id)).toEqual(['code']);
    expect(ctx.activated[0]!.action).toEqual({ kind: 'none' });
    expect(ctx.store.getState().selectedRingId).toBeNull();
  });

  it('document pointermove expands the nearest category inside the inflated panel zone', () => {
    // Desktop: names stacked 30 px apart on the right.
    vi.spyOn(ctx.root, 'getBoundingClientRect').mockReturnValue(rect(900, 300, 100, 90));
    ORBITALS.forEach((o, i) => {
      vi.spyOn(nameButton(ctx.root, o.id), 'getBoundingClientRect').mockReturnValue(rect(940, 300 + i * 30, 60, 20));
    });

    // Inside the panel's 60 px left inflation; nothing hovered yet, so the
    // name nearest in y wins.
    move(860, 342);
    expect(hovered(ctx.root)).toEqual(['experiences']);
    expect(ctx.rings[1]!.isFlatMode).toBe(false);

    // With a category hovered, only a direct (inflated) name hit switches it.
    move(905, 365);
    expect(hovered(ctx.root)).toEqual(['projects']);
    move(850, 305); // inside the panel zone but left of every inflated name
    expect(hovered(ctx.root)).toEqual(['projects']);

    // Leaving the inflated panel zone clears a panel-sourced hover.
    move(500, 340);
    expect(hovered(ctx.root)).toEqual([]);
  });

  it('ignores the moves of a pointer the scene holds captured, as in a drag across the panel', () => {
    vi.spyOn(ctx.root, 'getBoundingClientRect').mockReturnValue(rect(900, 300, 100, 90));
    ORBITALS.forEach((o, i) => {
      vi.spyOn(nameButton(ctx.root, o.id), 'getBoundingClientRect').mockReturnValue(rect(940, 300 + i * 30, 60, 20));
    });
    // A press on the scene captures the pointer, so its moves target the
    // canvas wherever they happen and bubble from there to the document.
    const moveOnScene = (x: number, y: number) =>
      ctx.canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, pointerId: 1, bubbles: true }));

    ctx.canvas.setPointerCapture(1);
    moveOnScene(960, 340); // over the experiences name
    expect(hovered(ctx.root)).toEqual([]);

    // Released, the same pointer hovers the panel again.
    ctx.canvas.releasePointerCapture(1);
    moveOnScene(960, 340);
    expect(hovered(ctx.root)).toEqual(['experiences']);
  });

  it('ends its pointer hover when the pointer leaves the page, and leaves a scene hover alone', () => {
    vi.spyOn(ctx.root, 'getBoundingClientRect').mockReturnValue(rect(900, 300, 100, 90));
    ORBITALS.forEach((o, i) => {
      vi.spyOn(nameButton(ctx.root, o.id), 'getBoundingClientRect').mockReturnValue(rect(940, 300 + i * 30, 60, 20));
    });
    // The root element gets pointerleave when a finger lifts or the browser
    // takes the touch, and when a mouse leaves the window; no move outside
    // the panel follows.
    const leavePage = () => document.documentElement.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'touch' }));

    move(960, 340); // over the experiences name
    expect(hovered(ctx.root)).toEqual(['experiences']);
    leavePage();
    expect(hovered(ctx.root)).toEqual([]);

    // The scene ends its own hover when the pointer leaves the canvas.
    ctx.store.hoverRing('projects', 'scene');
    leavePage();
    expect(hovered(ctx.root)).toEqual(['projects']);
  });

  it('reads the rects once, and again only after a resize, a scroll or a change of expansion', () => {
    const panelRect = vi.spyOn(ctx.root, 'getBoundingClientRect').mockReturnValue(rect(900, 300, 100, 90));
    const nameRects = ORBITALS.map((o, i) =>
      vi.spyOn(nameButton(ctx.root, o.id), 'getBoundingClientRect').mockReturnValue(rect(940, 300 + i * 30, 60, 20)),
    );
    const reads = () => [panelRect, ...nameRects].map(spy => spy.mock.calls.length);

    move(100, 100);
    move(120, 100);
    move(140, 100);
    expect(reads()).toEqual([1, 1, 1, 1]);

    move(860, 342); // hovers experiences: the layout is about to change
    move(905, 345); // the hovered name again: re-measured once
    move(910, 345);
    expect(reads()).toEqual([2, 2, 2, 2]);

    window.dispatchEvent(new Event('resize'));
    move(910, 345);
    window.dispatchEvent(new Event('scroll'));
    move(910, 345);
    expect(reads()).toEqual([4, 4, 4, 4]);
  });

  describe('keyboard', () => {
    it('focus on a category expands it like hover, and focus leaving the category collapses it', () => {
      nameButton(ctx.root, 'experiences').focus();
      expect(hovered(ctx.root)).toEqual(['experiences']);
      // Moving into the category's own nodes keeps it expanded.
      nodeButton(ctx.root, 'academic').focus();
      expect(hovered(ctx.root)).toEqual(['experiences']);
      nameButton(ctx.root, 'projects').focus();
      expect(hovered(ctx.root)).toEqual(['projects']);
      document.querySelector<HTMLElement>('.header-link')!.focus();
      expect(hovered(ctx.root)).toEqual([]);
    });

    it('a category holding keyboard focus stays expanded while pointer and scene hovers come and go', () => {
      nodeButton(ctx.root, 'academic').focus();
      expect(hovered(ctx.root)).toEqual(['experiences']);
      move(500, 340); // the pointer leaves the panel zone, ending the panel hover
      expect(hovered(ctx.root)).toEqual(['experiences']);
      ctx.store.hoverRing('projects', 'scene');
      expect(hovered(ctx.root)).toEqual(['experiences', 'projects']);
      ctx.store.hoverRing(null, 'scene');
      expect(hovered(ctx.root)).toEqual(['experiences']);
      expect(nameButton(ctx.root, 'experiences').getAttribute('aria-expanded')).toBe('true');
      expect(nodeButton(ctx.root, 'academic').tabIndex).toBe(0);
      // Focus leaving the category collapses it.
      document.querySelector<HTMLElement>('.header-link')!.focus();
      expect(hovered(ctx.root)).toEqual([]);
    });

    it('Shift+Tab from a category name puts the category before it in the tab order, at its last node first', () => {
      nameButton(ctx.root, 'experiences').focus();
      expect(tabbable()).toEqual(['academic', 'professional']);
      shiftTab();
      expect(tabbable()).toEqual(['papers', 'patents', 'presentations', 'academic', 'professional']);
      // The browser then moves focus to the last of those, the stop before
      // the name; keyboard focus there keeps its category in the tab order.
      nodeButton(ctx.root, 'presentations').focus();
      expect(tabbable()).toEqual(['papers', 'patents', 'presentations']);
      expect(hovered(ctx.root)).toEqual(['publications']);

      // From the first category's name, Shift+Tab leaves the panel.
      nameButton(ctx.root, 'publications').focus();
      shiftTab();
      expect(tabbable()).toEqual(['papers', 'patents', 'presentations']);
    });

    it('Shift+Tab with nothing focused enters the last category at its last node', () => {
      shiftTab();
      expect(document.activeElement).toBe(document.body);
      expect(tabbable()).toEqual(['engagements', 'code']);
    });

    it('focus on a node hovers its scene node until the node loses focus', () => {
      nodeButton(ctx.root, 'patents').focus();
      expect(nodeColor(ctx.rings[0]!, 1)).toBe(HIGHLIGHT);
      nodeButton(ctx.root, 'patents').blur();
      expect(nodeColor(ctx.rings[0]!, 1)).toBe(0x000000);
    });

    it('focus that a pointer press causes does not expand anything', () => {
      // Browsers do not match :focus-visible after a mouse or touch press.
      const matches = Element.prototype.matches;
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
        return selector === ':focus-visible' ? false : matches.call(this, selector);
      });
      nameButton(ctx.root, 'experiences').focus();
      expect(hovered(ctx.root)).toEqual([]);
    });

    it('a category that collapses around a node button focused by a click moves focus to its name', () => {
      // A mouse click focuses a button without :focus-visible, so its
      // category has no keyboard hover to keep it open.
      const matches = Element.prototype.matches;
      vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector: string) {
        return selector === ':focus-visible' ? false : matches.call(this, selector);
      });
      ctx.store.hoverRing('experiences', 'panel');
      nodeButton(ctx.root, 'academic').focus();
      expect(document.activeElement).toBe(nodeButton(ctx.root, 'academic'));

      ctx.store.hoverRing(null, 'panel'); // the pointer leaves the panel
      expect(hovered(ctx.root)).toEqual([]);
      expect(document.getElementById('ip-nodes-experiences')!.getAttribute('aria-hidden')).toBe('true');
      expect(document.activeElement).toBe(nameButton(ctx.root, 'experiences'));
    });

    it('Escape clears the selection and keeps the focused category expanded with focus on its name', () => {
      nameButton(ctx.root, 'publications').focus();
      nameButton(ctx.root, 'publications').click(); // Enter or Space on a button is a click
      nodeButton(ctx.root, 'patents').focus();
      expect(ctx.rings[0]!.isFlatMode).toBe(true);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(ctx.store.getState().selectedRingId).toBeNull();
      expect(ctx.rings[0]!.isFlatMode).toBe(false);
      expect(document.activeElement).toBe(nameButton(ctx.root, 'publications'));
      expect(hovered(ctx.root)).toEqual(['publications']);
    });

    it('Escape clears a selection made anywhere', () => {
      ctx.store.toggleSelection('projects');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(ctx.store.getState().selectedRingId).toBeNull();
    });
  });

  it('dispose() removes its elements and stops listening', () => {
    ctx.panel.dispose();
    expect(ctx.root.children).toHaveLength(0);
    ctx.store.toggleSelection('projects');
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ctx.store.getState().selectedRingId).toBe('projects');
  });
});

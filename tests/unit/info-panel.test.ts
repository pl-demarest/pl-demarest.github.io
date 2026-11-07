// @vitest-environment happy-dom
import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindScene } from '../../src/app/sceneBinding';
import { Store } from '../../src/app/store';
import { SECTIONS } from '../../src/content/site';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ORBITALS } from '../../src/scene/config';
import type * as InfoPanel from '../../src/ui/info-panel';

// info-panel.ts keeps its DOM references in module-level variables and
// registers document listeners on init, so every test imports a fresh module
// instance and removes the listeners that instance added. Hover and
// selection live in the store; bindScene renders them onto the rings.

type Panel = typeof InfoPanel;

const HIGHLIGHT = 0xa27fb8;
let added: Array<[string, EventListenerOrEventListenerObject]> = [];

async function setup(): Promise<{ panel: Panel; rings: OrbitalRing[]; root: HTMLElement; store: Store }> {
  document.body.innerHTML = '<canvas id="scene"></canvas><div id="info-panel"></div>';
  vi.resetModules();
  const realAdd = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (listener) added.push([type, listener]);
    realAdd(type, listener, options);
  });
  const panel: Panel = await import('../../src/ui/info-panel');
  const rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
  const store = new Store();
  bindScene(store, rings);
  panel.initInfoPanel(SECTIONS, store);
  return { panel, rings, root: document.getElementById('info-panel')!, store };
}

function category(root: HTMLElement, ringId: string): HTMLElement {
  return root.querySelector<HTMLElement>(`.ip-category[data-ring-id="${ringId}"]`)!;
}

function clickName(root: HTMLElement, ringId: string): void {
  category(root, ringId).querySelector<HTMLElement>('.ip-category-name')!.click();
}

function nodeColor(ring: OrbitalRing, i: number): number {
  return (ring.nodes[i]!.mesh.material as THREE.MeshBasicMaterial).color.getHex();
}

describe('info panel', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    ctx = await setup();
  });
  afterEach(() => {
    for (const [type, listener] of added) document.removeEventListener(type, listener);
    added = [];
    document.body.innerHTML = '';
  });

  it('renders one category per ring with its nodes, in config order', () => {
    const cats = [...ctx.root.querySelectorAll<HTMLElement>('.ip-category')];
    expect(cats.map(c => c.dataset['ringId'])).toEqual(ORBITALS.map(o => o.id));
    expect(cats.map(c => c.querySelector('.ip-category-name')!.textContent)).toEqual(
      ORBITALS.map(o => o.label),
    );
    cats.forEach((cat, i) => {
      const nodes = [...cat.querySelectorAll<HTMLElement>('.ip-nodes > .ip-node')];
      expect(nodes.map(n => n.dataset['nodeId'])).toEqual(ORBITALS[i]!.nodes.map(n => n.id));
      expect(nodes.map(n => n.textContent)).toEqual(ORBITALS[i]!.nodes.map(n => n.label));
    });
    expect(ctx.root.querySelector('.selected, .hovered')).toBeNull();
  });

  it('clicking a category selects it, flattens its ring and highlights its nodes', () => {
    const ring = ctx.rings[1]!;
    clickName(ctx.root, ring.config.id);
    expect(category(ctx.root, ring.config.id).classList.contains('selected')).toBe(true);
    expect(ring.isFlatMode).toBe(true);
    expect(ring.angularVelocity).toBe(0);
    ring.nodes.forEach((_, i) => expect(nodeColor(ring, i)).toBe(HIGHLIGHT));
    // Other rings are untouched.
    for (const other of ctx.rings.filter(r => r !== ring)) {
      expect(other.isFlatMode).toBe(false);
      expect(category(ctx.root, other.config.id).classList.contains('selected')).toBe(false);
    }
  });

  it('a second click on the same category deselects it', () => {
    const ring = ctx.rings[0]!;
    clickName(ctx.root, ring.config.id);
    clickName(ctx.root, ring.config.id);
    expect(category(ctx.root, ring.config.id).classList.contains('selected')).toBe(false);
    expect(ring.isFlatMode).toBe(false);
    expect(ring.angularVelocity).toBe(ring.config.speed);
    ring.nodes.forEach((_, i) => expect(nodeColor(ring, i)).toBe(0x000000));
  });

  it('clicking another category moves the selection', () => {
    const [a, b] = ctx.rings as [OrbitalRing, OrbitalRing];
    clickName(ctx.root, a.config.id);
    clickName(ctx.root, b.config.id);
    expect(a.isFlatMode).toBe(false);
    expect(b.isFlatMode).toBe(true);
    expect(ctx.root.querySelectorAll('.ip-category.selected')).toHaveLength(1);
    expect(category(ctx.root, b.config.id).classList.contains('selected')).toBe(true);
  });

  it('a click outside the panel clears the selection', () => {
    const ring = ctx.rings[2]!;
    clickName(ctx.root, ring.config.id);
    document.getElementById('scene')!.click();
    expect(ctx.root.querySelector('.ip-category.selected')).toBeNull();
    expect(ring.isFlatMode).toBe(false);
  });

  it('selectRingFromScene selects and survives the click that caused it', () => {
    const ring = ctx.rings[0]!;
    ctx.panel.selectRingFromScene(ring.config.id);
    expect(ring.isFlatMode).toBe(true);
    // The canvas pointerup that triggered the selection is followed by a
    // document click; that one click is ignored.
    document.getElementById('scene')!.click();
    expect(ring.isFlatMode).toBe(true);
    document.getElementById('scene')!.click();
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
    clickName(ctx.root, ring.config.id);
    ctx.store.hoverRing(ring.config.id, 'scene');
    expect(category(ctx.root, ring.config.id).classList.contains('hovered')).toBe(false);
  });

  it('a scene node hover marks exactly one panel node and clears on null', () => {
    ctx.store.hoverNode('patents', 'scene');
    const marked = [...ctx.root.querySelectorAll<HTMLElement>('.ip-node.scene-hovered')];
    expect(marked.map(n => n.dataset['nodeId'])).toEqual(['patents']);
    ctx.store.hoverNode('code', 'scene');
    expect(
      [...ctx.root.querySelectorAll<HTMLElement>('.ip-node.scene-hovered')].map(n => n.dataset['nodeId']),
    ).toEqual(['code']);
    ctx.store.hoverNode(null, 'scene');
    expect(ctx.root.querySelector('.ip-node.scene-hovered')).toBeNull();
  });

  it('pointer enter and leave on a panel node hover the scene node', () => {
    const ring = ctx.rings[0]!;
    const el = ctx.root.querySelector<HTMLElement>('.ip-node[data-node-id="papers"]')!;
    el.dispatchEvent(new PointerEvent('pointerenter'));
    expect(nodeColor(ring, 0)).toBe(HIGHLIGHT);
    el.dispatchEvent(new PointerEvent('pointerleave'));
    expect(nodeColor(ring, 0)).toBe(0x000000);
  });

  it('document pointermove expands the nearest category inside the inflated panel zone', () => {
    // happy-dom has no layout, so give the panel and the names fixed rects
    // (desktop: names stacked 30 px apart on the right).
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;
    vi.spyOn(ctx.root, 'getBoundingClientRect').mockReturnValue(rect(900, 300, 100, 90));
    ORBITALS.forEach((o, i) => {
      const name = category(ctx.root, o.id).querySelector<HTMLElement>('.ip-category-name')!;
      vi.spyOn(name, 'getBoundingClientRect').mockReturnValue(rect(940, 300 + i * 30, 60, 20));
    });
    const move = (x: number, y: number) =>
      document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));
    const hovered = () =>
      [...ctx.root.querySelectorAll<HTMLElement>('.ip-category.hovered')].map(c => c.dataset['ringId']);

    // Inside the panel's 60 px left inflation; nothing hovered yet, so the
    // name nearest in y wins.
    move(860, 342);
    expect(hovered()).toEqual(['experiences']);
    expect(ctx.rings[1]!.isFlatMode).toBe(false);

    // With a category hovered, only a direct (inflated) name hit switches it.
    move(905, 365);
    expect(hovered()).toEqual(['projects']);
    move(850, 305); // inside the panel zone but left of every inflated name
    expect(hovered()).toEqual(['projects']);

    // Leaving the inflated panel zone clears a panel-sourced hover.
    move(500, 340);
    expect(hovered()).toEqual([]);
  });
});


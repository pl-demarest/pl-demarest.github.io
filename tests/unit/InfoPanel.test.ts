// @vitest-environment happy-dom
import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindScene } from '../../src/app/sceneBinding';
import { Store } from '../../src/app/store';
import { SECTIONS } from '../../src/content/site';
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
}

function setup(): Ctx {
  document.body.innerHTML = PAGE;
  const root = document.getElementById('info-panel')!;
  const canvas = document.getElementById('scene')!;
  const store = new Store();
  const rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
  bindScene(store, rings);
  const panel = new InfoPanel(root, SECTIONS, store);
  return { panel, store, rings, root, canvas };
}

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

function category(root: HTMLElement, ringId: string): HTMLElement {
  return root.querySelector<HTMLElement>(`.ip-category[data-ring-id="${ringId}"]`)!;
}

function nameElement(root: HTMLElement, ringId: string): HTMLElement {
  return category(root, ringId).querySelector<HTMLElement>('.ip-category-name')!;
}

function nodeElement(root: HTMLElement, nodeId: string): HTMLElement {
  return root.querySelector<HTMLElement>(`.ip-node[data-node-id="${nodeId}"]`)!;
}

function nodeColor(ring: OrbitalRing, i: number): number {
  return (ring.nodes[i]!.mesh.material as THREE.MeshBasicMaterial).color.getHex();
}

const hovered = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.ip-category.hovered')].map(c => c.dataset['ringId']);

const move = (x: number, y: number) =>
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y }));

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

  it('clicking a category selects it, flattens its ring and highlights its nodes', () => {
    const ring = ctx.rings[1]!;
    nameElement(ctx.root, ring.config.id).click();
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
    nameElement(ctx.root, ring.config.id).click();
    nameElement(ctx.root, ring.config.id).click();
    expect(category(ctx.root, ring.config.id).classList.contains('selected')).toBe(false);
    expect(ring.isFlatMode).toBe(false);
    expect(ring.angularVelocity).toBe(ring.config.speed);
    ring.nodes.forEach((_, i) => expect(nodeColor(ring, i)).toBe(0x000000));
  });

  it('clicking another category moves the selection', () => {
    const [a, b] = ctx.rings as [OrbitalRing, OrbitalRing];
    nameElement(ctx.root, a.config.id).click();
    nameElement(ctx.root, b.config.id).click();
    expect(a.isFlatMode).toBe(false);
    expect(b.isFlatMode).toBe(true);
    expect(ctx.root.querySelectorAll('.ip-category.selected')).toHaveLength(1);
    expect(category(ctx.root, b.config.id).classList.contains('selected')).toBe(true);
  });

  it('a click outside the panel clears the selection', () => {
    const ring = ctx.rings[2]!;
    nameElement(ctx.root, ring.config.id).click();
    ctx.canvas.click();
    expect(ctx.root.querySelector('.ip-category.selected')).toBeNull();
    expect(ring.isFlatMode).toBe(false);
  });

  it('selectRingFromScene selects and survives the click that caused it', () => {
    const ring = ctx.rings[0]!;
    ctx.panel.selectRingFromScene(ring.config.id);
    expect(ring.isFlatMode).toBe(true);
    // The canvas pointerup that triggered the selection is followed by a
    // document click; that one click is ignored.
    ctx.canvas.click();
    expect(ring.isFlatMode).toBe(true);
    ctx.canvas.click();
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
    nameElement(ctx.root, ring.config.id).click();
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
    const el = nodeElement(ctx.root, 'papers');
    el.dispatchEvent(new PointerEvent('pointerenter'));
    expect(nodeColor(ring, 0)).toBe(HIGHLIGHT);
    el.dispatchEvent(new PointerEvent('pointerleave'));
    expect(nodeColor(ring, 0)).toBe(0x000000);
  });

  it('document pointermove expands the nearest category inside the inflated panel zone', () => {
    // Desktop: names stacked 30 px apart on the right.
    vi.spyOn(ctx.root, 'getBoundingClientRect').mockReturnValue(rect(900, 300, 100, 90));
    ORBITALS.forEach((o, i) => {
      vi.spyOn(nameElement(ctx.root, o.id), 'getBoundingClientRect').mockReturnValue(rect(940, 300 + i * 30, 60, 20));
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

  it('dispose() removes its elements and stops listening', () => {
    ctx.panel.dispose();
    expect(ctx.root.children).toHaveLength(0);
    ctx.store.toggleSelection('projects');
    document.body.click();
    expect(ctx.store.getState().selectedRingId).toBe('projects');
    ctx.panel.selectRingFromScene('experiences');
    expect(ctx.store.getState().selectedRingId).toBe('projects');
  });
});

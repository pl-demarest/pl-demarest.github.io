import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bindScene } from '../../src/app/sceneBinding';
import { Store } from '../../src/app/store';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import type { OrbitalNode } from '../../src/scene/OrbitalNode';
import { ORBITALS } from '../../src/scene/config';

const HIGHLIGHT = 0xa27fb8;

function color(node: OrbitalNode): number {
  return (node.mesh.material as THREE.MeshBasicMaterial).color.getHex();
}

function setup() {
  const store = new Store();
  const rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
  const unbind = bindScene(store, rings);
  return { store, rings, unbind };
}

describe('bindScene', () => {
  it('lays the selected ring flat with its nodes highlighted, and restores it when the selection moves', () => {
    const { store, rings } = setup();
    const [a, b] = rings as [OrbitalRing, OrbitalRing];
    store.toggleSelection(a.config.id);
    expect(a.isFlatMode).toBe(true);
    expect(a.nodes.map(color)).toEqual(a.nodes.map(() => HIGHLIGHT));

    store.toggleSelection(b.config.id);
    expect(a.isFlatMode).toBe(false);
    expect(a.angularVelocity).toBe(a.returnSpeed);
    expect(a.nodes.map(color)).toEqual(a.nodes.map(() => 0x000000));
    expect(b.isFlatMode).toBe(true);

    store.clearSelection();
    expect(rings.some(r => r.isFlatMode)).toBe(false);
  });

  it('highlights the hovered node whichever side hovered it', () => {
    const { store, rings } = setup();
    const papers = rings[0]!.nodes[0]!;
    const code = rings[2]!.nodes[1]!;
    store.hoverNode(papers.config.id, 'scene');
    expect(color(papers)).toBe(HIGHLIGHT);
    store.hoverNode(code.config.id, 'panel');
    expect(color(papers)).toBe(0x000000);
    expect(color(code)).toBe(HIGHLIGHT);
    store.hoverNode(null, 'panel');
    expect(color(code)).toBe(0x000000);
  });

  it('stops rendering once unbound', () => {
    const { store, rings, unbind } = setup();
    unbind();
    store.toggleSelection(rings[0]!.config.id);
    store.hoverNode(rings[1]!.nodes[0]!.config.id, 'scene');
    expect(rings[0]!.isFlatMode).toBe(false);
    expect(color(rings[1]!.nodes[0]!)).toBe(0x000000);
  });
});

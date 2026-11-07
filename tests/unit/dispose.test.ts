import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { OrbitalNode } from '../../src/scene/OrbitalNode';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ParticleField } from '../../src/scene/ParticleField';
import { ORBITALS } from '../../src/scene/config';

/** Spies on dispose() of every geometry and material under `root`. */
function disposeSpies(root: THREE.Object3D) {
  const spies: Array<ReturnType<typeof vi.spyOn>> = [];
  root.traverse(object => {
    const { geometry, material } = object as THREE.Mesh;
    if (geometry) spies.push(vi.spyOn(geometry, 'dispose'));
    if (material) spies.push(vi.spyOn(material as THREE.Material, 'dispose'));
  });
  return spies;
}

describe('dispose()', () => {
  it('OrbitalRing releases its line, its hit tube and its nodes, and leaves its parent', () => {
    const scene = new THREE.Scene();
    const ring = new OrbitalRing(ORBITALS[2]!);
    scene.add(ring.group);
    const spies = disposeSpies(ring.group);
    // Line and tube (geometry and material each), plus each node's.
    expect(spies).toHaveLength(4 + 2 * ring.nodes.length);
    ring.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
    expect(scene.children).not.toContain(ring.group);
  });

  it('OrbitalNode releases its geometry and material', () => {
    const node = new OrbitalNode(ORBITALS[0]!.nodes[0]!);
    const spies = disposeSpies(node.mesh);
    node.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('ParticleField releases both layers and leaves its parent', () => {
    const scene = new THREE.Scene();
    const field = new ParticleField();
    scene.add(field.backgroundGroup, field.foregroundGroup);
    const spies = [...disposeSpies(field.backgroundGroup), ...disposeSpies(field.foregroundGroup)];
    expect(spies).toHaveLength(4);
    field.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });
});

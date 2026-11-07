import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { OrbitalNode, disposeNodeGeometry } from '../../src/scene/OrbitalNode';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ParticleField } from '../../src/scene/ParticleField';
import { NODE_RADIUS, ORBITALS } from '../../src/scene/config';

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
  it('OrbitalRing releases its line, its hit tube and its node materials, and leaves its parent', () => {
    const scene = new THREE.Scene();
    const ring = new OrbitalRing(ORBITALS[2]!);
    scene.add(ring.group);
    const line = ring.group.children[0] as THREE.Line;
    const own = [line.geometry, line.material as THREE.Material, ring.hitMesh.geometry, ring.hitMesh.material as THREE.Material];
    const spies = [...own, ...ring.nodes.map(n => n.mesh.material as THREE.Material)].map(r => vi.spyOn(r, 'dispose'));
    const shared = vi.spyOn(ring.nodes[0]!.mesh.geometry, 'dispose');
    ring.dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    expect(shared).not.toHaveBeenCalled();
    expect(scene.children).not.toContain(ring.group);
  });

  it('OrbitalNode releases its material and leaves the shared geometry', () => {
    const node = new OrbitalNode(ORBITALS[0]!.nodes[0]!);
    const material = vi.spyOn(node.mesh.material as THREE.Material, 'dispose');
    const geometry = vi.spyOn(node.mesh.geometry, 'dispose');
    node.dispose();
    expect(material).toHaveBeenCalledTimes(1);
    expect(geometry).not.toHaveBeenCalled();
  });

  it('all nodes share one sphere geometry until disposeNodeGeometry() releases it', () => {
    const nodes = ORBITALS.flatMap(cfg => new OrbitalRing(cfg).nodes);
    const geometry = nodes[0]!.mesh.geometry as THREE.SphereGeometry;
    expect(new Set(nodes.map(n => n.mesh.geometry)).size).toBe(1);
    expect(geometry.parameters).toMatchObject({ radius: NODE_RADIUS, widthSegments: 8, heightSegments: 6 });

    const dispose = vi.spyOn(geometry, 'dispose');
    disposeNodeGeometry();
    expect(dispose).toHaveBeenCalledTimes(1);
    const next = new OrbitalNode(ORBITALS[0]!.nodes[0]!);
    expect(next.mesh.geometry).not.toBe(geometry);
    expect((next.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(NODE_RADIUS);
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

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OrbitalNode } from '../../src/scene/OrbitalNode';
import { NODE_RADIUS, ORBITALS } from '../../src/scene/config';

const CONFIG = ORBITALS[0]!.nodes[0]!;
const BLACK = new THREE.Color(0x000000);
const HIGHLIGHT = new THREE.Color(0xa27fb8);

function colorOf(node: OrbitalNode): THREE.Color {
  return (node.mesh.material as THREE.MeshBasicMaterial).color;
}

function settle(node: OrbitalNode, frames: number): void {
  for (let i = 0; i < frames; i++) node.update(1 / 60);
}

describe('OrbitalNode', () => {
  it('is a black wireframe sphere of NODE_RADIUS tagged with its id', () => {
    const node = new OrbitalNode(CONFIG);
    const material = node.mesh.material as THREE.MeshBasicMaterial;
    expect(material.wireframe).toBe(true);
    expect(colorOf(node).equals(BLACK)).toBe(true);
    expect((node.mesh.geometry as THREE.SphereGeometry).parameters.radius).toBe(NODE_RADIUS);
    expect(node.mesh.userData['nodeId']).toBe(CONFIG.id);
    expect(node.mesh.scale.x).toBe(1);
  });

  it('hover turns it the highlight colour and eases its scale to 1.3', () => {
    const node = new OrbitalNode(CONFIG);
    node.setHovered(true);
    expect(colorOf(node).equals(HIGHLIGHT)).toBe(true);
    // Scale is applied on update: 12 % of the remaining distance per call.
    expect(node.mesh.scale.x).toBe(1);
    node.update(1 / 60);
    expect(node.mesh.scale.x).toBeCloseTo(1.036, 12);
    expect(node.mesh.scale.y).toBeCloseTo(1.036, 12);
    settle(node, 9);
    expect(node.mesh.scale.x).toBeCloseTo(1.3 - 0.3 * 0.88 ** 10, 12);
    settle(node, 200);
    expect(node.mesh.scale.x).toBeCloseTo(1.3, 9);
  });

  it('unhover restores the colour and eases back to scale 1', () => {
    const node = new OrbitalNode(CONFIG);
    node.setHovered(true);
    settle(node, 200);
    node.setHovered(false);
    expect(colorOf(node).equals(BLACK)).toBe(true);
    node.update(1 / 60);
    expect(node.mesh.scale.x).toBeCloseTo(1.3 - 0.3 * 0.12, 9);
    settle(node, 200);
    expect(node.mesh.scale.x).toBeCloseTo(1, 9);
  });

  it('selection highlights the colour without scaling', () => {
    const node = new OrbitalNode(CONFIG);
    node.setSelected(true);
    expect(colorOf(node).equals(HIGHLIGHT)).toBe(true);
    settle(node, 60);
    expect(node.mesh.scale.x).toBe(1);
    // Hover off while selected keeps the highlight colour.
    node.setHovered(true);
    node.setHovered(false);
    expect(colorOf(node).equals(HIGHLIGHT)).toBe(true);
    node.setSelected(false);
    expect(colorOf(node).equals(BLACK)).toBe(true);
  });

  it('with easing off, the hover scale snaps', () => {
    const node = new OrbitalNode(CONFIG);
    node.setEasing(false);
    node.setHovered(true);
    node.update(1 / 60);
    expect(node.mesh.scale.x).toBe(1.3);
    node.setHovered(false);
    node.update(1 / 60);
    expect(node.mesh.scale.x).toBe(1);
  });

  it('nodes do not share a material', () => {
    const a = new OrbitalNode(CONFIG);
    const b = new OrbitalNode(CONFIG);
    a.setHovered(true);
    expect(colorOf(b).equals(BLACK)).toBe(true);
  });
});

// @vitest-environment happy-dom
// (three's FileLoader, used by loadCloudLayer, needs fetch and ProgressEvent.)
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CloudLayer, loadCloudLayer } from '../../src/scene/CloudLayer';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ORBITALS } from '../../src/scene/config';
import { buildLinesGlb, glbDataUrl } from './helpers/glb';
import { ringAngle, step } from './helpers/sim';

// Known defects found by a review of the code on 2026-11-07. Each test
// asserts the CORRECT behaviour. While a bug existed its test was marked
// it.fails; the fix commit flipped it to `it`, so all of them now guard
// against a regression. Test names start with the review's id for the
// defect. Add a new known defect here as it.fails.

const PUBLICATIONS = ORBITALS.find(o => o.id === 'publications')!;

/** Two edges as line-segment pairs. */
function edges(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0], 3));
  return geometry;
}

function settledFlatRing(): OrbitalRing {
  const r = new OrbitalRing(PUBLICATIONS);
  r.setFlatView(true);
  step(r, 60);
  return r;
}

describe('OrbitalRing known bugs', () => {
  it('flat-ring-perpetual-spin: a dragged flat ring comes to rest', () => {
    const r = settledFlatRing();
    // InteractionManager sets angularVelocity directly while dragging.
    r.angularVelocity = 2;
    step(r, 300);
    const before = ringAngle(r);
    step(r, 60);
    expect(Math.abs(ringAngle(r) - before)).toBeLessThan(0.01);
  });

  it('flat-ring-perpetual-spin: a flat ring coupled to a dragged ring comes to rest', () => {
    const r = settledFlatRing();
    // Coupling from a drag on another ring arrives through addVelocity.
    r.addVelocity(1.5);
    step(r, 300);
    const before = ringAngle(r);
    step(r, 60);
    expect(Math.abs(ringAngle(r) - before)).toBeLessThan(0.01);
  });

  it('framerate-dependent-physics: 60 Hz and 120 Hz stepping give the same motion after 1 s', () => {
    const at60 = new OrbitalRing(PUBLICATIONS);
    const at120 = new OrbitalRing(PUBLICATIONS);
    for (const r of [at60, at120]) {
      r.angularVelocity = 2;
      r.addTiltVelocity(0.5, 0.5);
    }
    step(at60, 60, 1 / 60);
    step(at120, 120, 1 / 120);

    const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b));
    expect(rel(at120.angularVelocity, at60.angularVelocity)).toBeLessThan(0.02);
    expect(rel(ringAngle(at120), ringAngle(at60))).toBeLessThan(0.02);
    expect(rel(at120.group.rotation.x, at60.group.rotation.x)).toBeLessThan(0.02);
  });
});

describe('CloudLayer (now a GLB consumer)', () => {
  // The landing page reads cloud-designer's binary glTF instead of its preset
  // JSON, so these three are rewritten against loadCloudLayer and CloudLayer.

  it('cloud-preset-contract / contract-swirls-merge: loads the line segments of a cloud-designer GLB', async () => {
    const glb = buildLinesGlb([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0], { translation: [2, 0, 0] });
    const scene = new THREE.Scene();
    const layer = await loadCloudLayer(scene, glbDataUrl(glb), { count: 2 });
    expect(scene.children).toContain(layer.group);
    expect(layer.instances).toHaveLength(2);
    // Two edges, with the node's translation applied.
    expect(Array.from(layer.instances[0]!.geometry.getAttribute('position').array)).toEqual([
      2, 0, 0, 3, 0, 0, 3, 0, 0, 3, 1, 0,
    ]);
    layer.dispose();
  });

  it('cloud-wrap-offscreen / cloudlayer-stagger-cancels: instances stay within [-spread, spread], evenly spaced', () => {
    const spread = 14;
    const speed = 0.4;
    const count = 3;
    const width = 2 * spread;
    const layer = new CloudLayer(edges(), { count, spread, speed });
    const cycle = width / speed;
    const eps = 1e-9;
    for (let t = 0; t < 2 * cycle; t += 0.1) {
      layer.update(0.1);
      const xs = layer.instances.map(i => i.position.x);
      for (const x of xs) {
        expect(x).toBeGreaterThan(-spread - eps);
        expect(x).toBeLessThanOrEqual(spread + eps);
      }
      // Each cloud trails the previous one by width / count along the band.
      for (let i = 0; i + 1 < count; i++) {
        const gap = (((xs[i]! - xs[i + 1]!) % width) + width) % width;
        expect(gap).toBeCloseTo(width / count, 9);
      }
    }
  });

  it('cloud-line-vs-linesegments / cloudlayer-line-strip: edge pairs render as LineSegments sharing one material', () => {
    const layer = new CloudLayer(edges(), { count: 3 });
    for (const instance of layer.instances) expect(instance).toBeInstanceOf(THREE.LineSegments);
    expect(new Set(layer.instances.map(i => i.material)).size).toBe(1);
    expect(new Set(layer.instances.map(i => i.geometry)).size).toBe(1);
  });
});

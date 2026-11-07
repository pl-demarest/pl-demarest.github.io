// @vitest-environment happy-dom
// (three's FileLoader, used by loadCloudLayer, needs fetch and ProgressEvent.)
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CloudLayer, cloudDriftX, loadCloudLayer, mergeLineSegments } from '../../src/scene/CloudLayer';
import { buildLinesGlb, glbDataUrl } from './helpers/glb';

function segments(positions: number[]): THREE.LineSegments {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry);
}

const EDGE = [0, 0, 0, 1, 0, 0];

describe('cloudDriftX', () => {
  const spread = 14;
  const speed = 0.4;
  const width = 2 * spread;

  it('starts the clouds evenly spaced from the right edge', () => {
    const xs = [0, 1, 2].map(i => cloudDriftX(0, i, 3, spread, speed));
    [spread, spread - width / 3, spread - (2 * width) / 3].forEach((x, i) => expect(xs[i]).toBeCloseTo(x, 12));
  });

  it('moves left at `speed` and wraps from the left edge to the right edge', () => {
    expect(cloudDriftX(10, 0, 3, spread, speed)).toBeCloseTo(spread - 10 * speed, 12);
    const justBefore = cloudDriftX(width / speed - 0.01, 0, 3, spread, speed);
    expect(justBefore).toBeCloseTo(-spread + 0.01 * speed, 9);
    expect(cloudDriftX(width / speed, 0, 3, spread, speed)).toBeCloseTo(spread, 9);
  });

  it('stays in (-spread, spread] at any time, negative times included', () => {
    for (let t = -200; t <= 200; t += 0.37) {
      for (let i = 0; i < 4; i++) {
        const x = cloudDriftX(t, i, 4, spread, speed);
        expect(x).toBeGreaterThan(-spread);
        expect(x).toBeLessThanOrEqual(spread);
      }
    }
  });
});

describe('mergeLineSegments', () => {
  it('merges every LineSegments under the root with its transform, and skips other objects', () => {
    const root = new THREE.Group();
    const a = segments(EDGE);
    a.position.set(0, 2, 0);
    const parent = new THREE.Group();
    parent.scale.setScalar(2);
    const b = segments(EDGE);
    parent.add(b);
    const strip = new THREE.Line(segments(EDGE).geometry);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry());
    root.add(a, parent, strip, mesh);

    const merged = mergeLineSegments(root)!;
    expect(Array.from(merged.getAttribute('position').array)).toEqual([0, 2, 0, 1, 2, 0, 0, 0, 0, 2, 0, 0]);
  });

  it('expands indexed segments into pairs', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0], 3));
    geometry.setIndex([0, 1, 1, 2]);
    const root = new THREE.Group();
    root.add(new THREE.LineSegments(geometry));
    expect(mergeLineSegments(root)!.getAttribute('position').count).toBe(4);
  });

  it('returns null when there are no line segments', () => {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry()));
    expect(mergeLineSegments(root)).toBeNull();
  });
});

describe('CloudLayer', () => {
  it('places each instance on the drift band at the configured depth, baseline and scale', () => {
    const layer = new CloudLayer(segments(EDGE).geometry, {
      count: 2,
      spread: 10,
      speed: 1,
      depth: -4,
      baselineY: -2,
      bobAmplitude: 0.5,
      bobPeriod: 4,
      scale: 1.5,
      opacity: 0.3,
    });
    const [first, second] = layer.instances as [THREE.LineSegments, THREE.LineSegments];
    expect(first.position.toArray()).toEqual([10, -2, -4]);
    // The second of two clouds starts half the band (20) behind the first.
    expect(second.position.x).toBeCloseTo(0, 12);
    expect(second.position.y).toBeCloseTo(-2, 12); // half a bob period later: sin(pi) = 0
    expect(first.scale.x).toBe(1.5);
    expect((first.material as THREE.LineBasicMaterial).opacity).toBe(0.3);

    layer.update(1); // a quarter bob period
    expect(first.position.x).toBeCloseTo(9, 12);
    expect(first.position.y).toBeCloseTo(-1.5, 12);
  });

  it('dispose() releases the shared geometry and material once and leaves the scene', () => {
    const scene = new THREE.Scene();
    const geometry = segments(EDGE).geometry;
    const layer = new CloudLayer(geometry, { count: 3 });
    scene.add(layer.group);
    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const materialDispose = vi.spyOn(layer.instances[0]!.material as THREE.Material, 'dispose');
    layer.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });
});

describe('loadCloudLayer', () => {
  it('rejects a GLB that holds no line segments', async () => {
    const triangles = buildLinesGlb([0, 0, 0, 1, 0, 0, 0, 1, 0], { mode: 4 });
    const scene = new THREE.Scene();
    await expect(loadCloudLayer(scene, glbDataUrl(triangles))).rejects.toThrow('has no line segments');
    expect(scene.children).toHaveLength(0);
  });
});

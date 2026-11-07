import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CloudLayer } from '../../src/scene/CloudLayer';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ORBITALS } from '../../src/scene/config';
import currentPreset from '../fixtures/cloud-preset-default.json';
import { ringAngle, step } from './helpers/sim';

// Known defects from the 2026-11-07 audit (audit.json, reports
// "github-landing" and "repo-hygiene-and-contract"). Each test asserts the
// CORRECT behaviour and is marked it.fails, so it passes while the bug exists.
// When a fix lands, its test starts "failing"; flip it to `it` in the fix
// commit. Test names start with the audit finding id.

type CloudLayerPreset = ConstructorParameters<typeof CloudLayer>[0];

const PUBLICATIONS = ORBITALS.find(o => o.id === 'publications')!;

/** The pre-rename schema CloudLayer reads today (cloud-designer's first commit). */
const LEGACY_PRESET: CloudLayerPreset = {
  swirls: [
    { position: [0, 0, 0], radius: 1.2, falloff: 0.5, shape: 'sphere', scale: [1, 1, 1] },
    { position: [1.6, 0.3, 0], radius: 1.0, falloff: 0.5, shape: 'ellipsoid', scale: [1.4, 0.8, 1] },
  ],
  merge: {
    resolution: 64,
    threshold: 1,
    wireframe: {
      mode: 'edges',
      frontPoint: [-2, 0, 0],
      backPoint: [2.5, 0, 0],
      numBands: 8,
      numFlowLines: 16,
      spiralTwist: Math.PI,
      showBands: true,
      showFlowLines: true,
    },
  },
};

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

describe('CloudLayer known bugs', () => {
  it.fails('cloud-preset-contract / contract-swirls-merge: accepts a current cloud-designer preset', () => {
    // tests/fixtures/cloud-preset-default.json is cloud-designer's DEFAULT_PRESET
    // (src/types/cloud.ts at 3a00166) as ExportPanel.exportJSON writes it.
    const scene = new THREE.Scene();
    expect(() => new CloudLayer(currentPreset as unknown as CloudLayerPreset, scene)).not.toThrow();
  });

  it.fails('cloud-wrap-offscreen / cloudlayer-stagger-cancels: instances stay within [-spread, spread]', () => {
    const scene = new THREE.Scene();
    const spread = 14;
    const speed = 0.4;
    const layer = new CloudLayer(LEGACY_PRESET, scene, { count: 3, spread, speed });
    const groups = scene.children;
    expect(groups).toHaveLength(3);

    // One full drift cycle; track each instance's X extent.
    const cycle = (2 * spread) / speed;
    const dt = 0.1;
    const min = groups.map(() => Infinity);
    const max = groups.map(() => -Infinity);
    for (let t = 0; t < cycle; t += dt) {
      layer.update(dt);
      groups.forEach((g, i) => {
        min[i] = Math.min(min[i]!, g.position.x);
        max[i] = Math.max(max[i]!, g.position.x);
      });
    }
    const eps = 1e-6;
    for (let i = 0; i < groups.length; i++) {
      expect(min[i], `instance ${i} min x`).toBeGreaterThanOrEqual(-spread - eps);
      expect(max[i], `instance ${i} max x`).toBeLessThanOrEqual(spread + eps);
    }
  });

  it.fails('cloud-line-vs-linesegments / cloudlayer-line-strip: edge pairs render as LineSegments', () => {
    const scene = new THREE.Scene();
    new CloudLayer(LEGACY_PRESET, scene, { count: 1 });
    const lines: THREE.Object3D[] = [];
    scene.traverse(o => {
      if (o instanceof THREE.Line) lines.push(o);
    });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toBeInstanceOf(THREE.LineSegments);
  });
});

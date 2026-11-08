import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ParticleField } from '../../src/scene/ParticleField';
import { PARTICLE_CONFIG } from '../../src/scene/config';
import { mulberry32 } from './helpers/sim';

const SEED = 42;
const { backgroundCount, foregroundCount, spread, driftSpeed, backgroundDepthRange, foregroundDepthRange } =
  PARTICLE_CONFIG;
const HALF = spread / 2;

/** The band wrap ParticleField applies after each step. */
function wrap(v: number): number {
  if (v > HALF) return v - spread;
  if (v < -HALF) return v + spread;
  return v;
}

function positions(points: ParticleField['backgroundGroup']): Float32Array {
  return points.geometry.getAttribute('position').array as Float32Array;
}

/**
 * The particle layout the constructor produces from a given random stream:
 * per particle x, y, z then vx, vy. The background layer takes the first
 * 5 x backgroundCount draws and the foreground the next 5 x foregroundCount.
 */
function expectedLayer(rand: () => number, count: number, depth: [number, number], speed: number) {
  const out: Array<{ x: number; y: number; z: number; vx: number; vy: number }> = [];
  for (let i = 0; i < count; i++) {
    const x = (rand() - 0.5) * spread;
    const y = (rand() - 0.5) * spread;
    const z = depth[0] + rand() * (depth[1] - depth[0]);
    const vx = (rand() - 0.5) * speed;
    const vy = (rand() - 0.5) * speed;
    out.push({ x, y, z, vx, vy });
  }
  return out;
}

/** A field laid out from a seeded source, as the browser suite gives the app one. */
const seededField = () => new ParticleField(mulberry32(SEED));

describe('ParticleField (seeded random source)', () => {
  it('lays out the background, then the foreground, from its random source', () => {
    const field = seededField();
    const rand = mulberry32(SEED);
    const layers = [
      { points: field.backgroundGroup, expected: expectedLayer(rand, backgroundCount, backgroundDepthRange, driftSpeed) },
      { points: field.foregroundGroup, expected: expectedLayer(rand, foregroundCount, foregroundDepthRange, driftSpeed * 1.5) },
    ];
    for (const { points, expected } of layers) {
      const pos = positions(points);
      expect(pos).toHaveLength(expected.length * 3);
      expected.forEach((p, i) => {
        expect(pos[i * 3]).toBeCloseTo(p.x, 5);
        expect(pos[i * 3 + 1]).toBeCloseTo(p.y, 5);
        expect(pos[i * 3 + 2]).toBeCloseTo(p.z, 5);
      });
    }
  });

  it('keeps its layout when other code draws from Math.random first', () => {
    // three.js draws every object's UUID from Math.random, so adding scene
    // objects before the field changes how much of Math.random it would see.
    const first = seededField();
    for (let i = 0; i < 6; i++) new THREE.Object3D();
    const second = seededField();
    expect(positions(second.backgroundGroup)).toEqual(positions(first.backgroundGroup));
    expect(positions(second.foregroundGroup)).toEqual(positions(first.foregroundGroup));
  });

  it('uses the configured opacities and point size', () => {
    const field = seededField();
    const bgMat = field.backgroundGroup.material as THREE.PointsMaterial;
    const fgMat = field.foregroundGroup.material as THREE.PointsMaterial;
    expect(bgMat.opacity).toBe(0.6);
    expect(fgMat.opacity).toBe(0.25);
    expect(bgMat.size).toBe(0.06);
    expect(bgMat.transparent).toBe(true);
  });

  it('drifts each particle by its velocity per update at 60 Hz, leaving z fixed', () => {
    const field = seededField();
    const rand = mulberry32(SEED);
    const layers = [
      { points: field.backgroundGroup, expected: expectedLayer(rand, backgroundCount, backgroundDepthRange, driftSpeed) },
      { points: field.foregroundGroup, expected: expectedLayer(rand, foregroundCount, foregroundDepthRange, driftSpeed * 1.5) },
    ];

    for (let frame = 1; frame <= 3; frame++) {
      field.update(1 / 60);
      for (const { points, expected } of layers) {
        const pos = positions(points);
        expected.forEach((p, i) => {
          expect(pos[i * 3]).toBeCloseTo(wrap(p.x + frame * p.vx), 5);
          expect(pos[i * 3 + 1]).toBeCloseTo(wrap(p.y + frame * p.vy), 5);
          expect(pos[i * 3 + 2]).toBeCloseTo(p.z, 6);
        });
      }
    }
    expect((field.backgroundGroup.geometry.getAttribute('position') as THREE.BufferAttribute).version).toBeGreaterThan(0);
  });

  it('drifts up to driftSpeed / 2 per 60 Hz frame on an axis, and 0.75 x driftSpeed in the foreground', () => {
    // The range config.ts documents for driftSpeed.
    const field = seededField();
    const layers = [field.backgroundGroup, field.foregroundGroup];
    const before = layers.map(points => Float32Array.from(positions(points)));
    field.update(1 / 60);
    const fastest = layers.map((points, l) => {
      let max = 0;
      positions(points).forEach((v, i) => {
        if (i % 3 !== 2) max = Math.max(max, Math.abs(wrap(v - before[l]![i]!)));
      });
      return max;
    });
    // Float32 positions round each step by up to about 1e-6.
    expect(fastest[0]).toBeLessThanOrEqual(driftSpeed / 2 + 1e-6);
    expect(fastest[0]).toBeGreaterThan(0.9 * (driftSpeed / 2));
    expect(fastest[1]).toBeLessThanOrEqual(0.75 * driftSpeed + 1e-6);
    expect(fastest[1]).toBeGreaterThan(0.9 * 0.75 * driftSpeed);
  });

  it('wraps particles that leave the [-spread/2, spread/2] band', () => {
    const field = seededField();
    const arr = positions(field.backgroundGroup);
    arr[0] = HALF + 0.5;
    arr[1] = -HALF - 0.5;
    field.update(1 / 60);
    expect(arr[0]).toBeGreaterThanOrEqual(-HALF);
    expect(arr[0]).toBeCloseTo(-HALF + 0.5, 2);
    expect(arr[1]).toBeLessThanOrEqual(HALF);
    expect(arr[1]).toBeCloseTo(HALF - 0.5, 2);
  });

  it('keeps every particle in the band over a long run', () => {
    const field = seededField();
    for (let i = 0; i < 2000; i++) field.update(1 / 60);
    for (const arr of [positions(field.backgroundGroup), positions(field.foregroundGroup)]) {
      for (let i = 0; i < arr.length; i += 3) {
        expect(Math.abs(arr[i]!)).toBeLessThanOrEqual(HALF);
        expect(Math.abs(arr[i + 1]!)).toBeLessThanOrEqual(HALF);
      }
    }
  });
});

describe('ParticleField default random source', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('draws from Math.random when given no source, as the app does for visitors', () => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(SEED));
    const field = new ParticleField();
    // The background layer's draws come first, before any three.js object.
    const bg = expectedLayer(mulberry32(SEED), backgroundCount, backgroundDepthRange, driftSpeed);
    const pos = positions(field.backgroundGroup);
    bg.forEach((p, i) => {
      expect(pos[i * 3]).toBeCloseTo(p.x, 5);
      expect(pos[i * 3 + 1]).toBeCloseTo(p.y, 5);
      expect(pos[i * 3 + 2]).toBeCloseTo(p.z, 5);
    });
  });
});

describe('ParticleField drift switch (reduced motion)', () => {
  it('holds every particle while drifting is off, and resumes when it is on', () => {
    const field = new ParticleField();
    const start = Float32Array.from(positions(field.backgroundGroup));
    field.setDrifting(false);
    for (let i = 0; i < 120; i++) field.update(1 / 60);
    expect(positions(field.backgroundGroup)).toEqual(start);
    field.setDrifting(true);
    field.update(1 / 60);
    expect(positions(field.backgroundGroup)).not.toEqual(start);
  });
});

import type { BufferAttribute, PointsMaterial } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
 * 5 x backgroundCount draws. three.js object constructors also draw from
 * Math.random (UUIDs), so the foreground layer's offset in the stream is not
 * pinned; its values are checked against ranges instead.
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

describe('ParticleField (Math.random seeded)', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockImplementation(mulberry32(SEED));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lays out both layers from the random stream in a fixed order', () => {
    const field = new ParticleField();
    const bg = expectedLayer(mulberry32(SEED), backgroundCount, backgroundDepthRange, driftSpeed);

    const bgPos = positions(field.backgroundGroup);
    const fgPos = positions(field.foregroundGroup);
    expect(bgPos).toHaveLength(backgroundCount * 3);
    expect(fgPos).toHaveLength(foregroundCount * 3);
    bg.forEach((p, i) => {
      expect(bgPos[i * 3]).toBeCloseTo(p.x, 5);
      expect(bgPos[i * 3 + 1]).toBeCloseTo(p.y, 5);
      expect(bgPos[i * 3 + 2]).toBeCloseTo(p.z, 5);
    });
    for (let i = 0; i < fgPos.length; i += 3) {
      expect(Math.abs(fgPos[i]!)).toBeLessThanOrEqual(HALF);
      expect(Math.abs(fgPos[i + 1]!)).toBeLessThanOrEqual(HALF);
      expect(fgPos[i + 2]).toBeGreaterThanOrEqual(foregroundDepthRange[0]);
      expect(fgPos[i + 2]).toBeLessThanOrEqual(foregroundDepthRange[1]);
    }
  });

  it('uses the configured opacities and point size', () => {
    const field = new ParticleField();
    const bgMat = field.backgroundGroup.material as PointsMaterial;
    const fgMat = field.foregroundGroup.material as PointsMaterial;
    expect(bgMat.opacity).toBe(0.6);
    expect(fgMat.opacity).toBe(0.25);
    expect(bgMat.size).toBe(0.06);
    expect(bgMat.transparent).toBe(true);
  });

  it('drifts each particle by its velocity per update at 60 Hz, leaving z fixed', () => {
    const field = new ParticleField();
    const bg = expectedLayer(mulberry32(SEED), backgroundCount, backgroundDepthRange, driftSpeed);
    const fg0 = Float32Array.from(positions(field.foregroundGroup));
    const fgStep: number[] = [];

    for (let frame = 1; frame <= 3; frame++) {
      field.update(1 / 60);
      const bgPos = positions(field.backgroundGroup);
      bg.forEach((p, i) => {
        expect(bgPos[i * 3]).toBeCloseTo(wrap(p.x + frame * p.vx), 5);
        expect(bgPos[i * 3 + 1]).toBeCloseTo(wrap(p.y + frame * p.vy), 5);
        expect(bgPos[i * 3 + 2]).toBeCloseTo(p.z, 6);
      });
      // Foreground: constant per-frame displacement within +-0.75 x driftSpeed.
      const fgPos = positions(field.foregroundGroup);
      for (let i = 0; i < fgPos.length; i++) {
        const d = wrap(fgPos[i]! - fg0[i]!) / frame;
        if (frame === 1) fgStep.push(d);
        expect(d).toBeCloseTo(fgStep[i]!, 5);
        expect(Math.abs(d)).toBeLessThanOrEqual(driftSpeed * 0.75 + 1e-6);
        if (i % 3 === 2) expect(d).toBe(0);
      }
    }
    expect((field.backgroundGroup.geometry.getAttribute('position') as BufferAttribute).version).toBeGreaterThan(0);
  });

  it('drifts up to driftSpeed / 2 per 60 Hz frame on an axis, and 0.75 x driftSpeed in the foreground', () => {
    // The range config.ts documents for driftSpeed.
    const field = new ParticleField();
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
    const field = new ParticleField();
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
    const field = new ParticleField();
    for (let i = 0; i < 2000; i++) field.update(1 / 60);
    for (const arr of [positions(field.backgroundGroup), positions(field.foregroundGroup)]) {
      for (let i = 0; i < arr.length; i += 3) {
        expect(Math.abs(arr[i]!)).toBeLessThanOrEqual(HALF);
        expect(Math.abs(arr[i + 1]!)).toBeLessThanOrEqual(HALF);
      }
    }
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

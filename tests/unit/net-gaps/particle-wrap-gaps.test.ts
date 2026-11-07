import { describe, expect, it } from 'vitest';
import { ParticleField } from '../../../src/scene/ParticleField';
import { PARTICLE_CONFIG } from '../../../src/scene/config';

// Gap found by mutation testing (2026-11-07): the existing wrap test pushes
// x past +spread/2 and y past -spread/2 only, so the other two wrap branches
// could clamp instead of wrapping without a failure.

const HALF = PARTICLE_CONFIG.spread / 2;

describe('ParticleField wrap gaps', () => {
  it('wraps x below -spread/2 and y above +spread/2 by one full spread', () => {
    const field = new ParticleField();
    const arr = field.backgroundGroup.geometry.getAttribute('position').array as Float32Array;
    arr[0] = -HALF - 0.5;
    arr[1] = HALF + 0.5;
    field.update(1 / 60);
    // Per-frame drift is at most driftSpeed / 2 = 0.001, inside the 2-digit tolerance.
    expect(arr[0]).toBeCloseTo(HALF - 0.5, 2);
    expect(arr[1]).toBeCloseTo(-HALF + 0.5, 2);
  });
});

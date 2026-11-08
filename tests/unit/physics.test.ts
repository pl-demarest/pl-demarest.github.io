import { describe, expect, it, vi } from 'vitest';
import { OrbitalNode } from '../../src/scene/OrbitalNode';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { ParticleField } from '../../src/scene/ParticleField';
import { ORBITALS } from '../../src/scene/config';
import { damp, lerpFactor, lerpToward } from '../../src/scene/physics';
import { mulberry32, ringAngle } from './helpers/sim';

describe('physics helpers', () => {
  it('reproduce the per-frame constants at 60 Hz', () => {
    expect(damp(2, 0.97, 1 / 60)).toBe(2 * 0.97);
    expect(lerpFactor(0.06, 1 / 60)).toBeCloseTo(0.06, 15);
    expect(lerpFactor(0.18, 1 / 60)).toBeCloseTo(0.18, 15);
    expect(lerpToward(1, 3, 0.12, 1 / 60)).toBeCloseTo(1 + 2 * 0.12, 15);
  });

  it('cover the same motion per second at any step', () => {
    for (const steps of [30, 120, 144]) {
      let v = 2;
      let x = 0;
      for (let i = 0; i < steps; i++) {
        v = damp(v, 0.97, 1 / steps);
        x = lerpToward(x, 1, 0.06, 1 / steps);
      }
      expect(v, `${steps} Hz`).toBeCloseTo(2 * 0.97 ** 60, 12);
      expect(x, `${steps} Hz`).toBeCloseTo(1 - 0.94 ** 60, 12);
    }
  });

  it('do nothing over a zero step', () => {
    expect(damp(2, 0.97, 0)).toBe(2);
    expect(lerpToward(1, 3, 0.5, 0)).toBe(1);
  });
});

/** Run a fresh object for one second at `hz` and read it. */
function after<T, R>(hz: number, seconds: number, make: () => T, step: (o: T, dt: number) => void, read: (o: T) => R): R {
  const o = make();
  for (let i = 0; i < Math.round(seconds * hz); i++) step(o, 1 / hz);
  return read(o);
}

const rel = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)));

describe('frame-rate independence (acceptance: within 2 % of 60 Hz after 1 s)', () => {
  const RATES = [30, 120, 144];
  const ringScenarios: Array<[string, () => OrbitalRing]> = [
    ...ORBITALS.map((cfg): [string, () => OrbitalRing] => [`cruise from launch: ${cfg.id}`, () => new OrbitalRing(cfg)]),
    [
      'after a drag impulse',
      () => {
        const r = new OrbitalRing(ORBITALS[0]!);
        r.angularVelocity = 2;
        r.addTiltVelocity(0.5, 0.5);
        return r;
      },
    ],
    [
      'a flat ring coasting after a direct drag',
      () => {
        const r = new OrbitalRing(ORBITALS[1]!);
        r.setFlatView(true);
        r.angularVelocity = 2;
        return r;
      },
    ],
  ];

  for (const [name, make] of ringScenarios) {
    it(`ring ${name}`, () => {
      const read = (r: OrbitalRing) => ({
        angle: ringAngle(r),
        velocity: r.angularVelocity,
        rotationX: r.group.rotation.x,
        rotationZ: r.group.rotation.z,
      });
      const step = (r: OrbitalRing, dt: number) => r.update(dt);
      const reference = after(60, 1, make, step, read);
      for (const hz of RATES) {
        const got = after(hz, 1, make, step, read);
        for (const key of Object.keys(reference) as Array<keyof typeof reference>) {
          expect(rel(got[key], reference[key]), `${key} at ${hz} Hz`).toBeLessThan(0.02);
        }
      }
    });
  }

  it('every ring settles at its cruise, config.speed, at any frame rate', () => {
    // layout.ts: speed "is the cruise angular velocity in rad/s: the speed
    // the viewer sees once a ring settles".
    for (const hz of [30, 60, 120, 144, 240]) {
      for (const cfg of ORBITALS) {
        const settled = after(hz, 60, () => new OrbitalRing(cfg), (r, dt) => r.update(dt), r => r.angularVelocity);
        expect(rel(settled, cfg.speed), `${cfg.id} at ${hz} Hz`).toBeLessThan(0.005);
      }
    }
  });

  it('the flat-view ease and the ease back to the tilt', () => {
    // Read 1/6 s in, while both eases are moving (10 frames at 60 Hz).
    const flatten = () => {
      const r = new OrbitalRing(ORBITALS[1]!);
      r.setFlatView(true);
      return r;
    };
    const unflatten = () => {
      const r = flatten();
      for (let i = 0; i < 60; i++) r.update(1 / 60);
      r.setFlatView(false);
      return r;
    };
    for (const make of [flatten, unflatten]) {
      const read = (r: OrbitalRing) => [r.group.rotation.x, r.group.rotation.z, ringAngle(r)] as const;
      const reference = after(60, 1 / 6, make, (r, dt) => r.update(dt), read);
      for (const hz of RATES) {
        const got = after(hz, 1 / 6, make, (r, dt) => r.update(dt), read);
        got.forEach((value, i) => {
          if (reference[i] === 0) expect(value).toBeCloseTo(0, 12);
          else expect(rel(value, reference[i]!), `${make.name}[${i}] at ${hz} Hz`).toBeLessThan(0.02);
        });
      }
    }
  });

  it('node hover easing and particle drift', () => {
    const node = () => {
      const n = new OrbitalNode(ORBITALS[0]!.nodes[0]!);
      n.setHovered(true);
      return n;
    };
    const scale = (n: OrbitalNode) => n.mesh.scale.x;
    const nodeReference = after(60, 1 / 6, node, (n, dt) => n.update(dt), scale);

    // The same seeded layout for every rate.
    const field = () => {
      vi.spyOn(Math, 'random').mockImplementation(mulberry32(7));
      const f = new ParticleField();
      vi.restoreAllMocks();
      return f;
    };
    const positions = (f: ParticleField) => [
      ...f.backgroundGroup.geometry.getAttribute('position').array,
      ...f.foregroundGroup.geometry.getAttribute('position').array,
    ];
    const fieldReference = after(60, 1, field, (f, dt) => f.update(dt), positions);

    for (const hz of RATES) {
      expect(rel(after(hz, 1 / 6, node, (n, dt) => n.update(dt), scale), nodeReference)).toBeLessThan(1e-9);
      // Positions are float32, so each step rounds; 4 digits is 1/1000 of a
      // second's largest drift (0.12 units).
      const got = after(hz, 1, field, (f, dt) => f.update(dt), positions);
      got.forEach((value, i) => expect(value, `particle coordinate ${i} at ${hz} Hz`).toBeCloseTo(fieldReference[i]!, 4));
    }
  });
});

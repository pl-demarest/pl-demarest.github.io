import { describe, expect, it } from 'vitest';
import { CRUISE_RATIO, OrbitalRing } from '../../src/scene/OrbitalRing';
import { ORBITALS, type OrbitalConfig } from '../../src/scene/config';
import { DT_60HZ, ringAngle, step } from './helpers/sim';

// Characterization of OrbitalRing.update, stepped at a fixed 60 Hz. Values
// were recorded from the per-frame implementation on 2026-11-07; the
// dt-correct physics reproduces them at 60 Hz.
//
// config.speed is now the cruise angular velocity in rad/s. The ring starts
// at, and returns toward, returnSpeed = config.speed / CRUISE_RATIO, which is
// the old config.speed (LEGACY_SPEED below).

const PUBLICATIONS = ORBITALS.find(o => o.id === 'publications')!;
const LEGACY_SPEED: Record<string, number> = { publications: 0.15, experiences: 0.1, projects: 0.08 };

function ring(cfg: OrbitalConfig = PUBLICATIONS): OrbitalRing {
  return new OrbitalRing(cfg);
}

/** [frame, angle, angularVelocity] for the publications ring from construction. */
const CRUISE_GOLDEN: Array<[number, number, number]> = [
  [1, 0.002424999999999999, 0.1455],
  [10, 0.02122488307599329, 0.11061361903423919],
  [23, 0.04072782384699779, 0.07520150252978446],
  [24, 0.04195642389498699, 0.07371600287935201],
  [30, 0.04886049557399072, 0.06596269793361953],
  [60, 0.07574284228879916, 0.046142069094013353],
  [120, 0.1165995170929919, 0.03851882699926457],
  [300, 0.23024593740472005, 0.037783876272891474],
  [600, 0.4191630159384982, 0.03778337531750311],
];

describe('OrbitalRing construction', () => {
  it('starts at the configured tilt and at its return speed, the pre-conversion speed', () => {
    for (const cfg of ORBITALS) {
      const r = ring(cfg);
      expect(r.group.rotation.x).toBe(cfg.tilt.x);
      expect(r.group.rotation.z).toBe(cfg.tilt.z);
      expect(r.returnSpeed).toBe(cfg.speed / CRUISE_RATIO);
      expect(r.returnSpeed).toBeCloseTo(LEGACY_SPEED[cfg.id]!, 15);
      expect(r.angularVelocity).toBe(r.returnSpeed);
      expect(r.isFlatMode).toBe(false);
      expect(r.nodes.map(n => n.config.id)).toEqual(cfg.nodes.map(n => n.id));
      expect(r.hitMesh.userData['ringId']).toBe(cfg.id);
      // Line, hit tube and one mesh per node.
      expect(r.group.children).toHaveLength(2 + cfg.nodes.length);
    }
  });

  it('places nodes at their angle offsets after the first step', () => {
    const r = ring();
    step(r, 1);
    for (const node of r.nodes) {
      const t = 0.002424999999999999 + node.config.angleOffset;
      expect(node.mesh.position.x).toBeCloseTo(Math.cos(t) * PUBLICATIONS.radiusX, 12);
      expect(node.mesh.position.y).toBe(0);
      expect(node.mesh.position.z).toBeCloseTo(Math.sin(t) * PUBLICATIONS.radiusY, 12);
    }
  });
});

describe('OrbitalRing cruise at 60 Hz', () => {
  it('matches the recorded angle and velocity trajectory', () => {
    const r = ring();
    let frame = 0;
    for (const [f, angle, velocity] of CRUISE_GOLDEN) {
      step(r, f - frame);
      frame = f;
      expect(ringAngle(r), `angle at frame ${f}`).toBeCloseTo(angle, 10);
      expect(r.angularVelocity, `velocity at frame ${f}`).toBeCloseTo(velocity, 10);
    }
  });

  it('keeps the tilt fixed while nothing perturbs it', () => {
    for (const cfg of ORBITALS) {
      const r = ring(cfg);
      step(r, 300);
      expect(r.group.rotation.x).toBeCloseTo(cfg.tilt.x, 12);
      expect(r.group.rotation.z).toBeCloseTo(cfg.tilt.z, 12);
    }
  });

  it('decays from its return speed s and settles at the cruise, config.speed = 0.2519 s', () => {
    // Friction (0.97 per frame) pulls velocity below half the return speed by
    // frame 24; the 1 % return term then balances friction at
    // v = 0.01 s / (1 - 0.97 * 0.99) = 0.25189 s.
    for (const cfg of ORBITALS) {
      const r = ring(cfg);
      const s = r.returnSpeed;
      step(r, 23);
      expect(r.angularVelocity / s).toBeGreaterThan(0.5);
      step(r, 1);
      expect(r.angularVelocity / s).toBeLessThan(0.5);
      step(r, 576);
      expect(r.angularVelocity / s).toBeCloseTo(0.01 / (1 - 0.97 * 0.99), 5);
      expect(r.angularVelocity).toBeCloseTo(cfg.speed, 10);
    }
  });

  it('a negative speed cruises the other way: the motion mirrors the positive ring', () => {
    // The return term used to compare |v| with a negative speed and pull
    // toward |speed|, so a reversed ring decayed to a stop.
    const forward = ring();
    const reverse = ring({ ...PUBLICATIONS, speed: -PUBLICATIONS.speed });
    for (let f = 1; f <= 600; f++) {
      step(forward, 1);
      step(reverse, 1);
      expect(reverse.angularVelocity, `velocity at frame ${f}`).toBeCloseTo(-forward.angularVelocity, 12);
      expect(ringAngle(reverse), `angle at frame ${f}`).toBeCloseTo(-ringAngle(forward), 10);
    }
    expect(reverse.angularVelocity).toBeCloseTo(-PUBLICATIONS.speed, 10);
  });

  it('scales the trajectory linearly with config.speed', () => {
    const reference = ring();
    const others = ORBITALS.filter(o => o !== PUBLICATIONS).map(ring);
    for (let f = 0; f < 120; f++) {
      step(reference, 1);
      for (const r of others) {
        step(r, 1);
        const k = r.config.speed / PUBLICATIONS.speed;
        expect(r.angularVelocity).toBeCloseTo(reference.angularVelocity * k, 12);
        expect(ringAngle(r)).toBeCloseTo(ringAngle(reference) * k, 10);
      }
    }
  });
});

describe('OrbitalRing flat view', () => {
  it('setFlatView(true) stops the orbit and eases the ring face-on', () => {
    const r = ring();
    r.setFlatView(true);
    expect(r.isFlatMode).toBe(true);
    expect(r.angularVelocity).toBe(0);

    const rx: number[] = [];
    let settledAt = -1;
    for (let f = 1; f <= 120; f++) {
      step(r, 1);
      rx.push(r.group.rotation.x);
      if (settledAt < 0 && r.group.rotation.x === Math.PI / 2 && r.group.rotation.z === 0) {
        settledAt = f;
      }
    }
    // 0.18 of the remaining distance per frame, snapped once within 0.001 rad.
    expect(rx[0]).toBeCloseTo(0.4877433388230814, 12);
    expect(rx[9]).toBeCloseTo(1.38925547188117, 12);
    expect(rx[29]).toBeCloseTo(1.567366663986206, 12);
    expect(settledAt).toBe(38);
    expect(ringAngle(r)).toBeCloseTo(0, 12);
    expect(r.angularVelocity).toBe(0);
  });

  it('settles within 38-39 frames for every ring', () => {
    const expected: Record<string, number> = { publications: 38, experiences: 39, projects: 38 };
    for (const cfg of ORBITALS) {
      const r = ring(cfg);
      r.setFlatView(true);
      let f = 0;
      while (!(r.group.rotation.x === Math.PI / 2 && r.group.rotation.z === 0) && f < 200) {
        step(r, 1);
        f++;
      }
      expect(f, cfg.id).toBe(expected[cfg.id]);
    }
  });

  it('ignores tilt impulses while flat', () => {
    const r = ring();
    r.setFlatView(true);
    step(r, 60);
    r.addTiltVelocity(5, 5);
    step(r, 60);
    expect(r.group.rotation.x).toBe(Math.PI / 2);
    expect(r.group.rotation.z).toBe(0);
  });

  it('setFlatView(false) restores the return speed and eases back to the tilt', () => {
    const r = ring();
    r.setFlatView(true);
    step(r, 120);
    r.setFlatView(false);
    expect(r.isFlatMode).toBe(false);
    expect(r.angularVelocity).toBe(r.returnSpeed);

    const golden: Array<[number, number, number, number]> = [
      // frame, rotation.x, rotation.z, angularVelocity
      [1, 1.4915485471872028, 0.018, 0.1455],
      [10, 0.9614008642527577, 0.13841546577153008, 0.11061361903423919],
      [30, 0.45638183066604077, 0.25312331815000055, 0.06596269793361953],
      [60, 0.28224831805250816, 0.2926752556624465, 0.046142069094013353],
      [120, 0.2507873689501692, 0.2998211604012983, 0.03851882699926457],
    ];
    let frame = 0;
    for (const [f, x, z, v] of golden) {
      step(r, f - frame);
      frame = f;
      expect(r.group.rotation.x, `rotation.x at ${f}`).toBeCloseTo(x, 10);
      expect(r.group.rotation.z, `rotation.z at ${f}`).toBeCloseTo(z, 10);
      expect(r.angularVelocity, `velocity at ${f}`).toBeCloseTo(v, 10);
    }
  });
});

describe('OrbitalRing impulses', () => {
  it('addVelocity adds to the angular velocity and friction decays it', () => {
    const r = ring();
    r.addVelocity(1);
    expect(r.angularVelocity).toBeCloseTo(LEGACY_SPEED['publications']! + 1, 12);
    step(r, 1);
    expect(r.angularVelocity).toBeCloseTo((LEGACY_SPEED['publications']! + 1) * 0.97, 12);
  });

  it('addTiltVelocity moves the tilt, which then eases back', () => {
    const r = ring();
    r.addTiltVelocity(0.5, -0.25);
    step(r, 1);
    // rotation += (target - rotation) * 0.06, then += velocity * dt.
    expect(r.group.rotation.x).toBeCloseTo(PUBLICATIONS.tilt.x - 0.25 * DT_60HZ, 12);
    expect(r.group.rotation.z).toBeCloseTo(PUBLICATIONS.tilt.z + 0.5 * DT_60HZ, 12);
    step(r, 600);
    expect(r.group.rotation.x).toBeCloseTo(PUBLICATIONS.tilt.x, 6);
    expect(r.group.rotation.z).toBeCloseTo(PUBLICATIONS.tilt.z, 6);
  });

  it('findNodeById returns the node or undefined', () => {
    const r = ring();
    expect(r.findNodeById('patents')?.config.label).toBe('Patents');
    expect(r.findNodeById('nope')).toBeUndefined();
  });
});

describe('OrbitalRing with auto-rotation off (reduced motion)', () => {
  it('stops at once, stays still, and still coasts after a direct drag', () => {
    const r = ring();
    step(r, 30);
    r.setAutoRotate(false);
    expect(r.angularVelocity).toBe(0);
    const angle = ringAngle(r);
    step(r, 600);
    expect(ringAngle(r)).toBe(angle);

    r.angularVelocity = 2;
    step(r, 600);
    expect(Math.abs(r.angularVelocity)).toBeLessThan(1e-6);
    const rest = ringAngle(r);
    step(r, 60);
    expect(Math.abs(ringAngle(r) - rest)).toBeLessThan(1e-6);
  });

  it('with easing off, the ring snaps into and out of the flat view', () => {
    const r = ring();
    r.setAutoRotate(false);
    r.setEasing(false);
    r.setFlatView(true);
    expect(r.group.rotation.x).toBe(Math.PI / 2);
    expect(r.group.rotation.z).toBe(0);
    step(r, 1);
    expect(r.group.rotation.x).toBe(Math.PI / 2);
    r.setFlatView(false);
    expect(r.group.rotation.x).toBe(PUBLICATIONS.tilt.x);
    expect(r.group.rotation.z).toBe(PUBLICATIONS.tilt.z);
    step(r, 60);
    expect(r.group.rotation.x).toBe(PUBLICATIONS.tilt.x);
    expect(r.group.rotation.z).toBe(PUBLICATIONS.tilt.z);
    // A drag still tilts it, and the tilt still eases back.
    r.addTiltVelocity(0.5, 0);
    step(r, 1);
    expect(r.group.rotation.z).toBeCloseTo(PUBLICATIONS.tilt.z + 0.5 * DT_60HZ, 12);
  });

  it('leaving the flat view does not relaunch it; turning it back on does', () => {
    const r = ring();
    r.setAutoRotate(false);
    r.setFlatView(true);
    step(r, 60);
    r.setFlatView(false);
    expect(r.angularVelocity).toBe(0);
    r.setAutoRotate(true);
    expect(r.angularVelocity).toBe(r.returnSpeed);
  });
});

import type { OrbitLayout } from './types';

/**
 * Orbit placement for each section, keyed by section id.
 *
 * speed is the cruise angular velocity in rad/s: the speed the viewer sees
 * once a ring settles. A negative speed turns the ring the other way. The
 * values are the earlier per-frame tuning (0.15, 0.1 and 0.08) times
 * OrbitalRing's CRUISE_RATIO (0.25189), written out in full so the motion is
 * unchanged.
 */
export const LAYOUT: Record<string, OrbitLayout> = {
  publications: {
    radiusX: 2.2,
    radiusY: 1.6,
    tilt: { x: 0.25, z: 0.3 },
    speed: 0.037783375314861395,
    couplingFactor: 0.4,
    nodeAngles: {
      papers: 0,
      patents: (2 * Math.PI) / 3,
      presentations: (4 * Math.PI) / 3,
    },
  },
  experiences: {
    radiusX: 3.2,
    radiusY: 2.3,
    tilt: { x: -0.15, z: -0.2 },
    speed: 0.025188916876574263,
    couplingFactor: 0.35,
    nodeAngles: {
      academic: 0.4,
      professional: 0.4 + Math.PI,
    },
  },
  projects: {
    radiusX: 4.2,
    radiusY: 3.0,
    tilt: { x: 0.1, z: -0.25 },
    speed: 0.02015113350125941,
    couplingFactor: 0.3,
    nodeAngles: {
      engagements: 0.9,
      code: 0.9 + Math.PI,
    },
  },
};

import type { OrbitalRing } from '../../../src/scene/OrbitalRing';

export const DT_60HZ = 1 / 60;

/** Advance a ring by `frames` fixed steps of `dt` seconds. */
export function step(ring: OrbitalRing, frames: number, dt = DT_60HZ): void {
  for (let i = 0; i < frames; i++) ring.update(dt);
}

/**
 * The ring's orbital angle, read back from its first node's position.
 * Nodes sit at (cos(angle + offset) * radiusX, 0, sin(angle + offset) * radiusY)
 * in the ring group's frame, so this uses only public state. The result is
 * in (-pi, pi] relative to the node's offset.
 */
export function ringAngle(ring: OrbitalRing): number {
  const node = ring.nodes[0]!;
  const p = node.mesh.position;
  const raw =
    Math.atan2(p.z / ring.config.radiusY, p.x / ring.config.radiusX) - node.config.angleOffset;
  return Math.atan2(Math.sin(raw), Math.cos(raw));
}

/** Deterministic PRNG (mulberry32) used to seed Math.random in tests. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

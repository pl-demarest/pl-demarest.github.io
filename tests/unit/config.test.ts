import { describe, expect, it } from 'vitest';
import { LAYOUT } from '../../src/content/layout';
import { SECTIONS } from '../../src/content/site';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { NODE_RADIUS, ORBITALS, PARTICLE_CONFIG, buildOrbitals } from '../../src/scene/config';
import { ringAngle, step } from './helpers/sim';

describe('scene config', () => {
  it('has unique ring ids and globally unique node ids', () => {
    const ringIds = ORBITALS.map(o => o.id);
    expect(new Set(ringIds).size).toBe(ringIds.length);
    const nodeIds = ORBITALS.flatMap(o => o.nodes.map(n => n.id));
    expect(new Set(nodeIds).size).toBe(nodeIds.length);
    // Node ids must not collide with ring ids either (both appear in the DOM).
    for (const id of nodeIds) expect(ringIds).not.toContain(id);
  });

  it('gives every node a finite angle offset and a label', () => {
    for (const ring of ORBITALS) {
      expect(ring.nodes.length).toBeGreaterThan(0);
      for (const node of ring.nodes) {
        expect(Number.isFinite(node.angleOffset), node.id).toBe(true);
        expect(node.label.trim()).not.toBe('');
      }
    }
  });

  it('has positive radii and coupling, a speed other than zero, rings ordered inside out', () => {
    let prev = 0;
    for (const ring of ORBITALS) {
      expect(ring.radiusX).toBeGreaterThan(0);
      expect(ring.radiusY).toBeGreaterThan(0);
      // A negative speed turns the ring the other way (OrbitLayout.speed);
      // a zero speed would leave it still.
      expect(ring.speed, ring.id).not.toBe(0);
      expect(ring.couplingFactor).toBeGreaterThan(0);
      expect(ring.radiusX).toBeGreaterThan(prev);
      prev = ring.radiusX;
      expect(Number.isFinite(ring.tilt.x) && Number.isFinite(ring.tilt.z)).toBe(true);
    }
  });

  it('a negative layout speed turns its ring the other way', () => {
    const layout = structuredClone(LAYOUT);
    layout['publications']!.speed = -LAYOUT['publications']!.speed;
    const forward = new OrbitalRing(ORBITALS[0]!);
    const reverse = new OrbitalRing(buildOrbitals(SECTIONS, layout)[0]!);
    step(forward, 120);
    step(reverse, 120);
    expect(ringAngle(forward)).toBeGreaterThan(0.1);
    expect(ringAngle(reverse)).toBeCloseTo(-ringAngle(forward), 12);
    expect(reverse.angularVelocity).toBeLessThan(0);
  });

  it('pins the current section order and labels', () => {
    expect(ORBITALS.map(o => o.label)).toEqual(['Publications', 'Experiences', 'Projects']);
    expect(ORBITALS.map(o => o.nodes.map(n => n.label))).toEqual([
      ['Papers', 'Patents', 'Presentations'],
      ['Academic', 'Professional'],
      ['Engagements', 'Code'],
    ]);
  });

  it('keeps particle depth ranges ordered and NODE_RADIUS positive', () => {
    expect(NODE_RADIUS).toBeGreaterThan(0);
    for (const [lo, hi] of [PARTICLE_CONFIG.backgroundDepthRange, PARTICLE_CONFIG.foregroundDepthRange]) {
      expect(lo).toBeLessThan(hi);
    }
  });
});

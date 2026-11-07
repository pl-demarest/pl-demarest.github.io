import { describe, expect, it } from 'vitest';
import { NODE_RADIUS, ORBITALS, PARTICLE_CONFIG } from '../../src/scene/config';

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

  it('has positive radii, speeds and coupling, rings ordered inside out', () => {
    let prev = 0;
    for (const ring of ORBITALS) {
      expect(ring.radiusX).toBeGreaterThan(0);
      expect(ring.radiusY).toBeGreaterThan(0);
      expect(ring.speed).toBeGreaterThan(0);
      expect(ring.couplingFactor).toBeGreaterThan(0);
      expect(ring.radiusX).toBeGreaterThan(prev);
      prev = ring.radiusX;
      expect(Number.isFinite(ring.tilt.x) && Number.isFinite(ring.tilt.z)).toBe(true);
    }
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

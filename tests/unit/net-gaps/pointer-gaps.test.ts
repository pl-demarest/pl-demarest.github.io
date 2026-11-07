// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionManager } from '../../../src/scene/InteractionManager';
import { OrbitalRing } from '../../../src/scene/OrbitalRing';
import { ORBITALS } from '../../../src/scene/config';
import { DT_60HZ, step } from '../helpers/sim';

// Gaps found by mutation testing (2026-11-07): the click threshold was only
// probed at 3 px and 20 px, and drag tilt was only probed with dy = 0 on the
// dragged ring, so the dy sign and the coupling factor on the tilt of the
// other rings were unpinned.

function setup() {
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5.5, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
  for (const r of rings) {
    step(r, 1);
    r.group.updateMatrixWorld(true);
  }
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const im = new InteractionManager(camera, canvas);
  im.setRings(rings);
  const onRingClick = vi.fn<(r: OrbitalRing) => void>();
  im.setRingClickCallback(onRingClick);
  return { camera, canvas, rings, onRingClick };
}

type Rig = ReturnType<typeof setup>;

/** A screen point on the ring's ellipse where that ring's tube is the first hit and no node is. */
function ringPoint(rig: Rig, ring: OrbitalRing): { x: number; y: number } {
  const ray = new THREE.Raycaster();
  for (let k = 0; k < 64; k++) {
    const theta = (k / 64) * Math.PI * 2;
    const local = new THREE.Vector3(Math.cos(theta) * ring.config.radiusX, 0, Math.sin(theta) * ring.config.radiusY);
    const ndc = ring.group.localToWorld(local).project(rig.camera);
    ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), rig.camera);
    const ringHit = ray.intersectObjects(rig.rings.map(r => r.hitMesh), false)[0];
    const nodeHit = ray.intersectObjects(rig.rings.flatMap(r => r.nodes.map(n => n.mesh)), false)[0];
    if (!nodeHit && ringHit?.object === ring.hitMesh) {
      return { x: ((ndc.x + 1) / 2) * window.innerWidth, y: ((1 - ndc.y) / 2) * window.innerHeight };
    }
  }
  throw new Error(`no clear point on ring ${ring.config.id}`);
}

function fire(target: EventTarget, type: string, p: { x: number; y: number }): void {
  target.dispatchEvent(new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1 }));
}

describe('InteractionManager gaps', () => {
  let rig: Rig;
  beforeEach(() => {
    rig = setup();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('a release under 5 px (Euclidean) from the press is a click; 5 px is not', () => {
    const ring = rig.rings[1]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointermove', p);

    // (2.7, 3.6) is 4.5 px away.
    fire(rig.canvas, 'pointerdown', p);
    fire(rig.canvas, 'pointerup', { x: p.x + 2.7, y: p.y + 3.6 });
    expect(rig.onRingClick).toHaveBeenCalledTimes(1);
    expect(rig.onRingClick).toHaveBeenLastCalledWith(ring);

    // (3, 4) is exactly 5 px away: neither axis alone reaches 5.
    fire(rig.canvas, 'pointerdown', p);
    fire(rig.canvas, 'pointerup', { x: p.x + 3, y: p.y + 4 });
    expect(rig.onRingClick).toHaveBeenCalledTimes(1);
  });

  it('a diagonal drag tilts the dragged ring by the full impulse and the others by couplingFactor', () => {
    const dragged = rig.rings[2]!;
    const p = ringPoint(rig, dragged);
    const x0 = rig.rings.map(r => r.group.rotation.x);
    const z0 = rig.rings.map(r => r.group.rotation.z);
    fire(rig.canvas, 'pointermove', p);
    fire(rig.canvas, 'pointerdown', p);
    // Pointer moves right 20 px and down 20 px.
    fire(rig.canvas, 'pointermove', { x: p.x + 20, y: p.y + 20 });
    for (const r of rig.rings) step(r, 1);

    const impulse = 20 * 0.005 * DT_60HZ;
    rig.rings.forEach((r, i) => {
      const k = r === dragged ? 1 : r.config.couplingFactor;
      // Rightward drag raises rotation.z; downward drag lowers rotation.x.
      expect(r.group.rotation.z - z0[i]!, `${r.config.id} z`).toBeCloseTo(impulse * k, 12);
      expect(r.group.rotation.x - x0[i]!, `${r.config.id} x`).toBeCloseTo(-impulse * k, 12);
    });
    fire(rig.canvas, 'pointerup', { x: p.x + 20, y: p.y + 20 });
  });
});

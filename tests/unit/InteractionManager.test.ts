// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InteractionManager } from '../../src/scene/InteractionManager';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import type { OrbitalNode } from '../../src/scene/OrbitalNode';
import { ORBITALS } from '../../src/scene/config';
import { step } from './helpers/sim';

// InteractionManager maps clientX/clientY to normalized device coordinates
// with window.innerWidth/innerHeight (not the canvas rect), so targets are
// projected through the same camera and converted with the window size.

const HIGHLIGHT = new THREE.Color(0xa27fb8);

interface Rig {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  rings: OrbitalRing[];
  im: InteractionManager;
  onNode: ReturnType<typeof vi.fn<(n: OrbitalNode | null) => void>>;
  onRingHover: ReturnType<typeof vi.fn<(r: OrbitalRing | null) => void>>;
  onRingClick: ReturnType<typeof vi.fn<(r: OrbitalRing) => void>>;
  onBackgroundClick: ReturnType<typeof vi.fn<() => void>>;
}

function buildRig(): Rig {
  // Same camera as SceneManager's desktop layout.
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 5.5, 8);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();

  const rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
  for (const r of rings) {
    step(r, 1); // place the nodes on their rings
    r.group.updateMatrixWorld(true);
  }

  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  const im = new InteractionManager(camera, canvas);
  im.setRings(rings);
  const onNode = vi.fn<(n: OrbitalNode | null) => void>();
  const onRingHover = vi.fn<(r: OrbitalRing | null) => void>();
  const onRingClick = vi.fn<(r: OrbitalRing) => void>();
  im.setHoverCallback(onNode);
  im.setRingHoverCallback(onRingHover);
  im.setRingClickCallback(onRingClick);
  const onBackgroundClick = vi.fn<() => void>();
  im.setBackgroundClickCallback(onBackgroundClick);
  return { camera, canvas, rings, im, onNode, onRingHover, onRingClick, onBackgroundClick };
}

function toClient(world: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } {
  const ndc = world.clone().project(camera);
  return {
    x: ((ndc.x + 1) / 2) * window.innerWidth,
    y: ((1 - ndc.y) / 2) * window.innerHeight,
  };
}

function pick(rig: Rig, p: { x: number; y: number }) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2((p.x / window.innerWidth) * 2 - 1, -(p.y / window.innerHeight) * 2 + 1),
    rig.camera,
  );
  const ringHit = ray.intersectObjects(rig.rings.map(r => r.hitMesh), false)[0];
  const nodeHit = ray.intersectObjects(rig.rings.flatMap(r => r.nodes.map(n => n.mesh)), false)[0];
  return { ringHit, nodeHit };
}

/** A screen point on `ring`'s ellipse where the ring is the first hit and no node is under the pointer. */
function ringPoint(rig: Rig, ring: OrbitalRing): { x: number; y: number } {
  const { radiusX, radiusY } = ring.config;
  for (let k = 0; k < 64; k++) {
    const theta = (k / 64) * Math.PI * 2;
    const local = new THREE.Vector3(Math.cos(theta) * radiusX, 0, Math.sin(theta) * radiusY);
    const p = toClient(ring.group.localToWorld(local), rig.camera);
    const { ringHit, nodeHit } = pick(rig, p);
    if (!nodeHit && ringHit?.object === ring.hitMesh) return p;
  }
  throw new Error(`no clear point on ring ${ring.config.id}`);
}

function nodePoint(rig: Rig, node: OrbitalNode): { x: number; y: number } {
  const p = toClient(node.mesh.getWorldPosition(new THREE.Vector3()), rig.camera);
  expect(pick(rig, p).nodeHit?.object).toBe(node.mesh);
  return p;
}

function fire(target: EventTarget, type: string, p: { x: number; y: number }): void {
  target.dispatchEvent(
    new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, button: 0 }),
  );
}

const EMPTY = { x: 4, y: 4 };

describe('InteractionManager', () => {
  let rig: Rig;

  beforeEach(() => {
    rig = buildRig();
    expect(pick(rig, EMPTY).ringHit).toBeUndefined();
  });
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('reports ring hover on and off and sets the cursor', () => {
    const ring = rig.rings[2]!;
    fire(rig.canvas, 'pointermove', ringPoint(rig, ring));
    expect(rig.onRingHover).toHaveBeenCalledTimes(1);
    expect(rig.onRingHover).toHaveBeenLastCalledWith(ring);
    expect(rig.onNode).not.toHaveBeenCalled();
    expect(rig.canvas.style.cursor).toBe('grab');

    // Moving along the same ring does not re-fire.
    fire(rig.canvas, 'pointermove', ringPoint(rig, ring));
    expect(rig.onRingHover).toHaveBeenCalledTimes(1);

    fire(rig.canvas, 'pointermove', EMPTY);
    expect(rig.onRingHover).toHaveBeenCalledTimes(2);
    expect(rig.onRingHover).toHaveBeenLastCalledWith(null);
    expect(rig.canvas.style.cursor).toBe('default');
  });

  it('hovering a node highlights it and reports both the node and its ring', () => {
    const ring = rig.rings[0]!;
    const node = ring.nodes[1]!;
    fire(rig.canvas, 'pointermove', nodePoint(rig, node));
    expect(rig.onNode).toHaveBeenCalledTimes(1);
    expect(rig.onNode).toHaveBeenLastCalledWith(node);
    expect(rig.onRingHover).toHaveBeenLastCalledWith(ring);
    expect((node.mesh.material as THREE.MeshBasicMaterial).color.equals(HIGHLIGHT)).toBe(true);
    expect(rig.canvas.style.cursor).toBe('pointer');

    fire(rig.canvas, 'pointermove', EMPTY);
    expect(rig.onNode).toHaveBeenLastCalledWith(null);
    expect(rig.onRingHover).toHaveBeenLastCalledWith(null);
    expect((node.mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(0x000000);
  });

  it('a press and release in place over a hovered ring is a ring click', () => {
    const ring = rig.rings[1]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointermove', p);
    fire(rig.canvas, 'pointerdown', p);
    expect(rig.canvas.style.cursor).toBe('grabbing');
    fire(rig.canvas, 'pointerup', { x: p.x + 3, y: p.y });
    expect(rig.onRingClick).toHaveBeenCalledTimes(1);
    expect(rig.onRingClick).toHaveBeenLastCalledWith(ring);
    expect(rig.onBackgroundClick).not.toHaveBeenCalled();
    expect(rig.canvas.style.cursor).toBe('grab');
  });

  it('a press and release on empty space is a background click, not a ring click', () => {
    fire(rig.canvas, 'pointermove', EMPTY);
    fire(rig.canvas, 'pointerdown', EMPTY);
    fire(rig.canvas, 'pointerup', EMPTY);
    expect(rig.onRingClick).not.toHaveBeenCalled();
    expect(rig.onBackgroundClick).toHaveBeenCalledTimes(1);
    expect(rig.canvas.style.cursor).toBe('default');
  });

  it('a drag across empty space and leaving the canvas are not background clicks', () => {
    fire(rig.canvas, 'pointerdown', EMPTY);
    fire(rig.canvas, 'pointerup', { x: EMPTY.x + 20, y: EMPTY.y });
    fire(rig.canvas, 'pointerdown', EMPTY);
    fire(rig.canvas, 'pointerleave', EMPTY);
    expect(rig.onBackgroundClick).not.toHaveBeenCalled();
  });

  it('dragging a ring sets its spin from the pointer delta and couples the others', () => {
    const [inner, middle, outer] = rig.rings as [OrbitalRing, OrbitalRing, OrbitalRing];
    const p = ringPoint(rig, outer);
    const before = rig.rings.map(r => r.angularVelocity);
    fire(rig.canvas, 'pointermove', p);
    fire(rig.canvas, 'pointerdown', p);
    rig.onRingHover.mockClear();
    fire(rig.canvas, 'pointermove', { x: p.x + 20, y: p.y });

    // orbitForce = dx * 0.008; dragged ring: orbitForce / 0.016.
    expect(outer.angularVelocity).toBeCloseTo((20 * 0.008) / 0.016, 12);
    // Others: += orbitForce * couplingFactor * 0.25 / 0.016.
    for (const [r, v0] of [
      [inner, before[0]!],
      [middle, before[1]!],
    ] as const) {
      expect(r.angularVelocity).toBeCloseTo(v0 + (20 * 0.008 * r.config.couplingFactor * 0.25) / 0.016, 12);
    }
    // No hover processing while dragging.
    expect(rig.onRingHover).not.toHaveBeenCalled();

    // Tilt impulse: rotation moves on the next step (dy = 0 so only z changes).
    const z0 = outer.group.rotation.z;
    const x0 = outer.group.rotation.x;
    step(outer, 1);
    expect(outer.group.rotation.z).toBeCloseTo(z0 + 20 * 0.005 * (1 / 60), 12);
    expect(outer.group.rotation.x).toBeCloseTo(x0, 12);

    fire(rig.canvas, 'pointerup', { x: p.x + 20, y: p.y });
    expect(rig.onRingClick).not.toHaveBeenCalled();
  });

  it('pointerleave ends a drag', () => {
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointermove', p);
    fire(rig.canvas, 'pointerdown', p);
    fire(rig.canvas, 'pointerleave', { x: p.x + 30, y: p.y });
    const v = ring.angularVelocity;
    fire(rig.canvas, 'pointermove', { x: p.x + 60, y: p.y });
    expect(ring.angularVelocity).toBe(v);
  });
});

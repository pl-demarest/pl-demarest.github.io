// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindScene } from '../../src/app/sceneBinding';
import { Store } from '../../src/app/store';
import { InteractionManager, type PickTarget } from '../../src/scene/InteractionManager';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import type { OrbitalNode } from '../../src/scene/OrbitalNode';
import { ORBITALS } from '../../src/scene/config';
import { step } from './helpers/sim';

// InteractionManager maps clientX/clientY to normalized device coordinates
// through the canvas rect. happy-dom has no layout, so each rig stubs the
// rect; targets are projected through the same camera and rect.

const HIGHLIGHT = new THREE.Color(0xa27fb8);

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Rig {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  box: Box;
  rings: OrbitalRing[];
  im: InteractionManager;
  store: Store;
  onHover: ReturnType<typeof vi.fn<(t: PickTarget | null) => void>>;
  onRingClick: ReturnType<typeof vi.fn<(r: OrbitalRing) => void>>;
  onNodeClick: ReturnType<typeof vi.fn<(n: OrbitalNode) => void>>;
  onBackgroundClick: ReturnType<typeof vi.fn<() => void>>;
}

function buildRig(box: Box = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }): Rig {
  // Same camera as SceneManager's desktop layout.
  const camera = new THREE.PerspectiveCamera(45, box.width / box.height, 0.1, 100);
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
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
    ...box,
    x: box.left,
    y: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
  } as DOMRect);

  // Hover reaches the scene the way App wires it: through the store.
  const store = new Store();
  bindScene(store, rings);
  const onHover = vi.fn<(t: PickTarget | null) => void>(target => {
    store.hoverNode(target?.node?.config.id ?? null, 'scene');
    store.hoverRing(target?.ring.config.id ?? null, 'scene');
  });
  const onRingClick = vi.fn<(r: OrbitalRing) => void>();
  const onNodeClick = vi.fn<(n: OrbitalNode) => void>();
  const onBackgroundClick = vi.fn<() => void>();
  const im = new InteractionManager(camera, canvas, { onHover, onRingClick, onNodeClick, onBackgroundClick });
  im.setRings(rings);
  return { camera, canvas, box, rings, im, store, onHover, onRingClick, onNodeClick, onBackgroundClick };
}

function toClient(rig: Rig, world: THREE.Vector3): { x: number; y: number } {
  const ndc = world.clone().project(rig.camera);
  return {
    x: rig.box.left + ((ndc.x + 1) / 2) * rig.box.width,
    y: rig.box.top + ((1 - ndc.y) / 2) * rig.box.height,
  };
}

function pick(rig: Rig, p: { x: number; y: number }) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(((p.x - rig.box.left) / rig.box.width) * 2 - 1, -((p.y - rig.box.top) / rig.box.height) * 2 + 1),
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
    const p = toClient(rig, ring.group.localToWorld(local));
    const { ringHit, nodeHit } = pick(rig, p);
    if (!nodeHit && ringHit?.object === ring.hitMesh) return p;
  }
  throw new Error(`no clear point on ring ${ring.config.id}`);
}

function nodePoint(rig: Rig, node: OrbitalNode): { x: number; y: number } {
  const p = toClient(rig, node.mesh.getWorldPosition(new THREE.Vector3()));
  expect(pick(rig, p).nodeHit?.object).toBe(node.mesh);
  return p;
}

function fire(
  target: EventTarget,
  type: string,
  p: { x: number; y: number },
  init: PointerEventInit = {},
  timeStamp?: number,
): void {
  const event = new PointerEvent(type, {
    clientX: p.x,
    clientY: p.y,
    bubbles: true,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    ...init,
  });
  // Drag speed uses event time; PointerEventInit cannot set it.
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  target.dispatchEvent(event);
}

const EMPTY = { x: 4, y: 4 };
/** The main button held, as in every pointermove of a real drag. */
const HELD: PointerEventInit = { buttons: 1 };
const color = (node: OrbitalNode) => (node.mesh.material as THREE.MeshBasicMaterial).color;

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
    expect(rig.onHover).toHaveBeenCalledTimes(1);
    expect(rig.onHover).toHaveBeenLastCalledWith({ ring, node: null });
    expect(rig.canvas.style.cursor).toBe('grab');

    // Moving along the same ring does not re-fire.
    fire(rig.canvas, 'pointermove', ringPoint(rig, ring));
    expect(rig.onHover).toHaveBeenCalledTimes(1);

    fire(rig.canvas, 'pointermove', EMPTY);
    expect(rig.onHover).toHaveBeenCalledTimes(2);
    expect(rig.onHover).toHaveBeenLastCalledWith(null);
    expect(rig.canvas.style.cursor).toBe('default');
  });

  it('hovering a node reports it with its ring and highlights it through the store', () => {
    const ring = rig.rings[0]!;
    const node = ring.nodes[1]!;
    fire(rig.canvas, 'pointermove', nodePoint(rig, node));
    expect(rig.onHover).toHaveBeenLastCalledWith({ ring, node });
    expect(rig.store.getState().hoveredRing).toEqual({ id: ring.config.id, source: 'scene' });
    expect(color(node).equals(HIGHLIGHT)).toBe(true);
    expect(rig.canvas.style.cursor).toBe('pointer');

    fire(rig.canvas, 'pointermove', EMPTY);
    expect(rig.onHover).toHaveBeenLastCalledWith(null);
    expect(color(node).getHex()).toBe(0x000000);
  });

  it('leaving the canvas clears the hover and resets the cursor', () => {
    const node = rig.rings[0]!.nodes[0]!;
    fire(rig.canvas, 'pointermove', nodePoint(rig, node));
    fire(rig.canvas, 'pointerleave', EMPTY);
    expect(rig.onHover).toHaveBeenLastCalledWith(null);
    expect(rig.store.getState()).toMatchObject({ hoveredRing: null, hoveredNode: null });
    expect(color(node).getHex()).toBe(0x000000);
    expect(rig.canvas.style.cursor).toBe('default');
  });

  it('maps pointer coordinates through the canvas rect, not the window', () => {
    document.body.innerHTML = '';
    rig = buildRig({ left: 600, top: 400, width: 400, height: 300 });
    const ring = rig.rings[1]!;
    // A point on the ring, inside the inset canvas, that the window-based
    // mapping would aim away from the ring.
    const windowRay = new THREE.Raycaster();
    let p: { x: number; y: number } | null = null;
    for (let k = 0; k < 64 && !p; k++) {
      const theta = (k / 64) * Math.PI * 2;
      const local = new THREE.Vector3(Math.cos(theta) * ring.config.radiusX, 0, Math.sin(theta) * ring.config.radiusY);
      const q = toClient(rig, ring.group.localToWorld(local));
      const { ringHit, nodeHit } = pick(rig, q);
      windowRay.setFromCamera(
        new THREE.Vector2((q.x / window.innerWidth) * 2 - 1, -(q.y / window.innerHeight) * 2 + 1),
        rig.camera,
      );
      const windowHit = windowRay.intersectObjects(rig.rings.map(r => r.hitMesh), false)[0];
      if (!nodeHit && ringHit?.object === ring.hitMesh && windowHit?.object !== ring.hitMesh) p = q;
    }
    expect(p).not.toBeNull();

    fire(rig.canvas, 'pointermove', p!);
    expect(rig.onHover).toHaveBeenLastCalledWith({ ring, node: null });
  });

  it('a pick while the canvas has no size picks nothing and does not stop later picks', () => {
    // A canvas that is hidden, or not laid out yet, measures 0 x 0.
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    vi.mocked(rig.canvas.getBoundingClientRect).mockReturnValueOnce(
      { left: 0, top: 0, x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 } as DOMRect,
    );
    fire(rig.canvas, 'pointermove', p);
    expect(rig.onHover).not.toHaveBeenCalled();
    // The canvas has its size again; no resize or scroll event came in between.
    fire(rig.canvas, 'pointermove', p);
    expect(rig.onHover).toHaveBeenLastCalledWith({ ring, node: null });
  });

  describe('when the canvas changes size without a window resize', () => {
    // happy-dom's ResizeObserver never calls back; this one is called by hand.
    class FakeResizeObserver {
      static instances: FakeResizeObserver[] = [];
      readonly observed = new Set<Element>();
      constructor(readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this);
      }
      observe(element: Element): void {
        this.observed.add(element);
      }
      unobserve(element: Element): void {
        this.observed.delete(element);
      }
      disconnect(): void {
        this.observed.clear();
      }
      notify(): void {
        this.callback([], this as unknown as ResizeObserver);
      }
    }

    beforeEach(() => {
      FakeResizeObserver.instances = [];
      vi.stubGlobal('ResizeObserver', FakeResizeObserver);
      document.body.innerHTML = '';
      rig = buildRig();
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const canvasObserver = () => FakeResizeObserver.instances.find(o => o.observed.has(rig.canvas));

    it('re-measures the canvas after a ResizeObserver notification', () => {
      const observer = canvasObserver();
      expect(observer, 'a ResizeObserver on the canvas').toBeDefined();
      const full = rig.box;
      fire(rig.canvas, 'pointermove', EMPTY); // measures and keeps the full-window rect

      // The canvas shrinks to the top-left quarter of the window.
      const quarter = { left: 0, top: 0, width: full.width / 2, height: full.height / 2 };
      vi.mocked(rig.canvas.getBoundingClientRect).mockReturnValue({
        ...quarter,
        x: 0,
        y: 0,
        right: quarter.width,
        bottom: quarter.height,
      } as DOMRect);
      observer!.notify();

      // A point on the inner ring as the smaller canvas shows it, which the
      // full-window rect would aim away from that ring.
      const ring = rig.rings[0]!;
      let p: { x: number; y: number } | null = null;
      for (let k = 0; k < 64 && !p; k++) {
        const theta = (k / 64) * Math.PI * 2;
        const local = new THREE.Vector3(Math.cos(theta) * ring.config.radiusX, 0, Math.sin(theta) * ring.config.radiusY);
        rig.box = quarter;
        const q = toClient(rig, ring.group.localToWorld(local));
        const inQuarter = pick(rig, q);
        rig.box = full;
        const inFull = pick(rig, q);
        if (!inQuarter.nodeHit && inQuarter.ringHit?.object === ring.hitMesh && inFull.ringHit?.object !== ring.hitMesh) p = q;
      }
      expect(p).not.toBeNull();

      fire(rig.canvas, 'pointermove', p!);
      expect(rig.onHover).toHaveBeenLastCalledWith({ ring, node: null });
    });

    it('dispose() stops observing the canvas', () => {
      expect(canvasObserver()).toBeDefined();
      rig.im.dispose();
      expect(canvasObserver()).toBeUndefined();
    });
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
    expect(rig.onNodeClick).not.toHaveBeenCalled();
    expect(rig.onBackgroundClick).not.toHaveBeenCalled();
    expect(rig.canvas.style.cursor).toBe('grab');
  });

  it('a click resolves to what was under the press, with no hover before it (a touch tap)', () => {
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointerdown', p, { pointerType: 'touch' });
    fire(rig.canvas, 'pointerup', p, { pointerType: 'touch' });
    // Touch sends pointerleave right after pointerup; it is not a second click.
    fire(rig.canvas, 'pointerleave', p, { pointerType: 'touch' });
    expect(rig.onRingClick).toHaveBeenCalledTimes(1);
    expect(rig.onRingClick).toHaveBeenLastCalledWith(ring);
  });

  it('a click on a node reports its ring, then the node', () => {
    const ring = rig.rings[0]!;
    const node = ring.nodes[2]!;
    const order: string[] = [];
    rig.onRingClick.mockImplementation(r => order.push(`ring:${r.config.id}`));
    rig.onNodeClick.mockImplementation(n => order.push(`node:${n.config.id}`));
    const p = nodePoint(rig, node);
    fire(rig.canvas, 'pointerdown', p);
    fire(rig.canvas, 'pointerup', p);
    expect(order).toEqual([`ring:${ring.config.id}`, `node:${node.config.id}`]);
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

  it('a release without a press on the canvas is not a click', () => {
    const p = ringPoint(rig, rig.rings[1]!);
    fire(rig.canvas, 'pointermove', p);
    fire(rig.canvas, 'pointerdown', p);
    fire(rig.canvas, 'pointerup', p);
    // A press that began elsewhere and ends here.
    fire(rig.canvas, 'pointerup', p);
    expect(rig.onRingClick).toHaveBeenCalledTimes(1);
  });

  it('only the main mouse button and the primary pointer press', () => {
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    const v = ring.angularVelocity;
    fire(rig.canvas, 'pointerdown', p, { button: 2 });
    fire(rig.canvas, 'pointermove', { x: p.x + 40, y: p.y });
    fire(rig.canvas, 'pointerup', p, { button: 2 });
    fire(rig.canvas, 'pointerdown', p, { pointerType: 'touch', pointerId: 7, isPrimary: false });
    fire(rig.canvas, 'pointerup', p, { pointerType: 'touch', pointerId: 7, isPrimary: false });
    expect(ring.angularVelocity).toBe(v);
    expect(rig.onRingClick).not.toHaveBeenCalled();
    expect(rig.canvas.hasPointerCapture(7)).toBe(false);
  });

  it('a press captures the pointer and the release frees it', () => {
    const p = ringPoint(rig, rig.rings[0]!);
    fire(rig.canvas, 'pointerdown', p);
    expect(rig.canvas.hasPointerCapture(1)).toBe(true);
    fire(rig.canvas, 'pointerup', p);
    expect(rig.canvas.hasPointerCapture(1)).toBe(false);
  });

  describe('when setPointerCapture throws', () => {
    // An exception in a listener reaches the dispatchEvent caller in this environment.
    const failCapture = (name: string) =>
      vi.spyOn(rig.canvas, 'setPointerCapture').mockImplementation(() => {
        throw new DOMException('setPointerCapture failed', name);
      });

    it('a press with no active pointer behind it (NotFoundError) still drags and releases', () => {
      // Browsers throw NotFoundError when no active pointer has the id, as for
      // a script-made event or a pointer whose release came first.
      failCapture('NotFoundError');
      const ring = rig.rings[2]!;
      const p = ringPoint(rig, ring);
      expect(() => fire(rig.canvas, 'pointerdown', p, {}, 1000)).not.toThrow();
      expect(rig.canvas.style.cursor).toBe('grabbing');
      fire(rig.canvas, 'pointermove', { x: p.x + 20, y: p.y }, HELD, 1016);
      expect(ring.angularVelocity).toBeCloseTo((20 * 0.008) / 0.016, 12);
      fire(rig.canvas, 'pointerup', { x: p.x + 20, y: p.y });
      expect(rig.canvas.style.cursor).not.toBe('grabbing');
    });

    it('any other capture error still surfaces', () => {
      failCapture('InvalidStateError');
      expect(() => fire(rig.canvas, 'pointerdown', ringPoint(rig, rig.rings[2]!))).toThrow('setPointerCapture failed');
    });
  });

  it('dragging a ring sets its spin from the pointer delta and couples the others', () => {
    const [inner, middle, outer] = rig.rings as [OrbitalRing, OrbitalRing, OrbitalRing];
    const p = ringPoint(rig, outer);
    const before = rig.rings.map(r => r.angularVelocity);
    fire(rig.canvas, 'pointermove', p);
    fire(rig.canvas, 'pointerdown', p, {}, 1000);
    rig.onHover.mockClear();
    fire(rig.canvas, 'pointermove', { x: p.x + 20, y: p.y }, HELD, 1016);

    // Dragged ring: dx * 0.008 over the 16 ms since the press.
    expect(outer.angularVelocity).toBeCloseTo((20 * 0.008) / 0.016, 12);
    // Others: += dx * 0.008 * couplingFactor * 0.25 / 0.016, whatever the interval.
    for (const [r, v0] of [
      [inner, before[0]!],
      [middle, before[1]!],
    ] as const) {
      expect(r.angularVelocity).toBeCloseTo(v0 + (20 * 0.008 * r.config.couplingFactor * 0.25) / 0.016, 12);
    }
    // No hover processing while dragging.
    expect(rig.onHover).not.toHaveBeenCalled();

    // Tilt impulse: rotation moves on the next step (dy = 0 so only z changes).
    const z0 = outer.group.rotation.z;
    const x0 = outer.group.rotation.x;
    step(outer, 1);
    expect(outer.group.rotation.z).toBeCloseTo(z0 + 20 * 0.005 * (1 / 60), 12);
    expect(outer.group.rotation.x).toBeCloseTo(x0, 12);

    fire(rig.canvas, 'pointerup', { x: p.x + 20, y: p.y });
    expect(rig.onRingClick).not.toHaveBeenCalled();
  });

  it('drag spin follows the pointer speed, so the event rate does not change it', () => {
    // The same 60 px stroke in 100 ms, sent at 60 Hz and at 120 Hz.
    const strokes = [
      { events: 6, stepPx: 10, stepMs: 100 / 6 },
      { events: 12, stepPx: 5, stepMs: 100 / 12 },
    ];
    const results = strokes.map(({ events, stepPx, stepMs }) => {
      document.body.innerHTML = '';
      const r = buildRig();
      const [, middle, outer] = r.rings as [OrbitalRing, OrbitalRing, OrbitalRing];
      const p = ringPoint(r, outer);
      const coupledBefore = middle.angularVelocity;
      fire(r.canvas, 'pointerdown', p, {}, 1000);
      for (let i = 1; i <= events; i++) {
        fire(r.canvas, 'pointermove', { x: p.x + i * stepPx, y: p.y }, HELD, 1000 + i * stepMs);
      }
      return { spin: outer.angularVelocity, coupled: middle.angularVelocity - coupledBefore };
    });
    // 600 px/s * 0.008 = 4.8 rad/s; coupling 60 px * 0.125 * couplingFactor.
    expect(results[0]!.spin).toBeCloseTo(4.8, 9);
    expect(results[1]!.spin).toBeCloseTo(4.8, 9);
    expect(results[1]!.coupled).toBeCloseTo(results[0]!.coupled, 12);
    expect(results[0]!.coupled).toBeCloseTo(60 * 0.125 * ORBITALS[1]!.couplingFactor, 12);
  });

  it('during a drag, a move of another pointer leaves the scene hover alone', () => {
    const [inner, , outer] = rig.rings as [OrbitalRing, OrbitalRing, OrbitalRing];
    const p = ringPoint(rig, outer);
    const finger = { pointerType: 'touch', buttons: 1 };
    // The first finger presses the outer ring.
    fire(rig.canvas, 'pointerdown', p, finger, 1000);
    // A second finger, a non-primary pointer, moves over the inner ring.
    fire(rig.canvas, 'pointermove', ringPoint(rig, inner), { ...finger, pointerId: 2, isPrimary: false }, 1008);
    expect(rig.onHover).not.toHaveBeenCalled();
    expect(rig.store.getState().hoveredRing).toBeNull();
    expect(rig.canvas.style.cursor).toBe('grabbing');
    // The first finger still drags: 20 px in the 16 ms since its press.
    fire(rig.canvas, 'pointermove', { x: p.x + 20, y: p.y }, finger, 1016);
    expect(outer.angularVelocity).toBeCloseTo((20 * 0.008) / 0.016, 12);
  });

  it('a drag keeps going after the pointer leaves the canvas, until the release', () => {
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointerdown', p, {}, 1000);
    fire(rig.canvas, 'pointerleave', { x: p.x + 30, y: p.y });
    // The move after leaving still drags: 60 px from the press in 16 ms.
    fire(rig.canvas, 'pointermove', { x: p.x + 60, y: p.y }, HELD, 1016);
    expect(ring.angularVelocity).toBeCloseTo((60 * 0.008) / 0.016, 12);
    fire(rig.canvas, 'pointerup', { x: p.x + 60, y: p.y });
    const v = ring.angularVelocity;
    fire(rig.canvas, 'pointermove', { x: p.x + 90, y: p.y });
    expect(ring.angularVelocity).toBe(v);
  });

  it('a move with no button down ends a press whose release never reached the page', () => {
    // A button let go after a window or app switch sends no pointerup; every
    // later move arrives with buttons === 0.
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    const before = ring.angularVelocity;
    fire(rig.canvas, 'pointerdown', p, { buttons: 1 }, 1000);
    expect(rig.canvas.style.cursor).toBe('grabbing');

    fire(rig.canvas, 'pointermove', { x: p.x + 60, y: p.y }, { buttons: 0 }, 1016);
    expect(ring.angularVelocity).toBe(before);
    expect(rig.canvas.style.cursor).not.toBe('grabbing');
    expect(rig.canvas.hasPointerCapture(1)).toBe(false);

    // Hover picking works again, and a late release is not a click.
    fire(rig.canvas, 'pointermove', p, { buttons: 0 });
    expect(rig.onHover).toHaveBeenLastCalledWith({ ring, node: null });
    fire(rig.canvas, 'pointerup', p);
    expect(rig.onRingClick).not.toHaveBeenCalled();
  });

  it('pointercancel ends a drag without a click', () => {
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointerdown', p);
    fire(rig.canvas, 'pointercancel', p);
    const v = ring.angularVelocity;
    fire(rig.canvas, 'pointermove', { x: p.x + 40, y: p.y });
    fire(rig.canvas, 'pointerup', p);
    expect(ring.angularVelocity).toBe(v);
    expect(rig.onRingClick).not.toHaveBeenCalled();
    expect(rig.canvas.hasPointerCapture(1)).toBe(false);
    expect(rig.canvas.style.cursor).not.toBe('grabbing');
  });

  it('dispose() stops listening and lets go of a held pointer', () => {
    const ring = rig.rings[2]!;
    const p = ringPoint(rig, ring);
    fire(rig.canvas, 'pointerdown', p);
    rig.im.dispose();
    expect(rig.canvas.hasPointerCapture(1)).toBe(false);
    const v = ring.angularVelocity;
    fire(rig.canvas, 'pointermove', { x: p.x + 40, y: p.y });
    fire(rig.canvas, 'pointerup', p);
    fire(rig.canvas, 'pointermove', p);
    expect(ring.angularVelocity).toBe(v);
    expect(rig.onRingClick).not.toHaveBeenCalled();
    expect(rig.onHover).not.toHaveBeenCalled();
  });

  it('setRings replaces the pickable rings', () => {
    const [inner, , outer] = rig.rings as [OrbitalRing, OrbitalRing, OrbitalRing];
    const p = ringPoint(rig, inner);
    rig.im.setRings([outer]);
    fire(rig.canvas, 'pointermove', p);
    expect(rig.onHover).not.toHaveBeenCalledWith({ ring: inner, node: null });
    fire(rig.canvas, 'pointermove', ringPoint(rig, outer));
    expect(rig.onHover).toHaveBeenLastCalledWith({ ring: outer, node: null });
  });
});

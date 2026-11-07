import * as THREE from 'three';
import type { OrbitalNode } from './OrbitalNode';
import type { OrbitalRing } from './OrbitalRing';

/** What a pointer is over: a ring, or one of its nodes. */
export interface PickTarget {
  readonly ring: OrbitalRing;
  readonly node: OrbitalNode | null;
}

export interface InteractionHandlers {
  /** The pointer moved onto another target, or off every target or the canvas (null). */
  onHover?: (target: PickTarget | null) => void;
  /** A press and release in place on a ring or on one of its nodes. */
  onRingClick?: (ring: OrbitalRing) => void;
  /** A press and release in place on a node; reported after onRingClick for its ring. */
  onNodeClick?: (node: OrbitalNode) => void;
  /** A press and release in place away from every ring and node. */
  onBackgroundClick?: () => void;
}

/** A release closer than this to its press, in CSS px, is a click. */
const CLICK_THRESHOLD = 5;
/** Orbit angle per px of horizontal drag: the dragged ring spins at this times the pointer speed. */
const ORBIT_FORCE = 0.008;
/**
 * Spin added to each other ring per px of drag, in rad/s, before its
 * couplingFactor. Tuned as a quarter of ORBIT_FORCE per 16 ms event.
 */
const COUPLED_SPIN_PER_PX = (ORBIT_FORCE * 0.25) / 0.016;
/** Tilt velocity added per px of drag, in rad/s. */
const TILT_SCALE = 0.005;
/**
 * Shortest pointer event interval used for drag speed, in seconds. Browsers
 * send at most one pointermove per frame; this bounds the speed of a burst.
 */
const MIN_EVENT_INTERVAL = 1 / 240;

interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  /** What was under the pointer at the press; a click resolves to it. */
  readonly target: PickTarget | null;
}

interface Drag {
  readonly ring: OrbitalRing;
  lastX: number;
  lastY: number;
  /** Event time of the last press or move, in ms. */
  lastTime: number;
}

/**
 * Pointer input on the scene canvas: hover picking, drag-to-spin with
 * coupled rings, and clicks. A press captures the pointer, so a drag keeps
 * going over the header and the panel; a release under CLICK_THRESHOLD from
 * the press is a click on whatever was under the press.
 */
export class InteractionManager {
  private readonly camera: THREE.Camera;
  private readonly canvas: HTMLCanvasElement;
  private readonly handlers: InteractionHandlers;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly listeners = new AbortController();

  private rings: OrbitalRing[] = [];
  private ringMeshes: THREE.Object3D[] = [];
  private nodeMeshes: THREE.Object3D[] = [];
  private readonly targets = new Map<THREE.Object3D, PickTarget>();

  /** The canvas rect, cached until the window resizes or scrolls. */
  private canvasRect: DOMRect | null = null;
  private press: Press | null = null;
  private drag: Drag | null = null;
  private hovered: PickTarget | null = null;

  constructor(camera: THREE.Camera, canvas: HTMLCanvasElement, handlers: InteractionHandlers = {}) {
    this.camera = camera;
    this.canvas = canvas;
    this.handlers = handlers;

    const { signal } = this.listeners;
    canvas.addEventListener('pointerdown', this.onPointerDown, { signal });
    canvas.addEventListener('pointermove', this.onPointerMove, { signal });
    canvas.addEventListener('pointerup', this.onPointerUp, { signal });
    canvas.addEventListener('pointercancel', this.onPointerCancel, { signal });
    canvas.addEventListener('pointerleave', this.onPointerLeave, { signal });
    window.addEventListener('resize', this.invalidateRect, { signal });
    window.addEventListener('scroll', this.invalidateRect, { capture: true, passive: true, signal });
  }

  /** Stop listening and let go of any press. */
  dispose(): void {
    this.endPress();
    this.listeners.abort();
    this.rings = [];
    this.ringMeshes = [];
    this.nodeMeshes = [];
    this.targets.clear();
    this.hovered = null;
    this.canvas.style.cursor = '';
  }

  /** Replace the pickable rings; rebuilds the pick lists. */
  setRings(rings: OrbitalRing[]): void {
    this.rings = rings;
    this.targets.clear();
    for (const ring of rings) {
      this.targets.set(ring.hitMesh, { ring, node: null });
      for (const node of ring.nodes) this.targets.set(node.mesh, { ring, node });
    }
    this.ringMeshes = rings.map(ring => ring.hitMesh);
    this.nodeMeshes = rings.flatMap(ring => ring.nodes.map(node => node.mesh));
    this.press = null;
    this.drag = null;
    this.setHovered(null);
  }

  /** The node under the client point, else the ring, else null. */
  private pick(clientX: number, clientY: number): PickTarget | null {
    const rect = (this.canvasRect ??= this.canvas.getBoundingClientRect());
    if (rect.width === 0 || rect.height === 0) return null;
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hit =
      this.raycaster.intersectObjects(this.nodeMeshes, false)[0] ??
      this.raycaster.intersectObjects(this.ringMeshes, false)[0];
    return hit ? (this.targets.get(hit.object) ?? null) : null;
  }

  private readonly invalidateRect = (): void => {
    this.canvasRect = null;
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    // A second finger, or a mouse button other than the main one, is not a press.
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (this.press) this.endPress();
    const target = this.pick(e.clientX, e.clientY);
    this.press = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, target };
    this.canvas.setPointerCapture(e.pointerId);
    if (target) this.drag = { ring: target.ring, lastX: e.clientX, lastY: e.clientY, lastTime: e.timeStamp };
    this.updateCursor();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.drag && this.press?.pointerId === e.pointerId) {
      const dx = e.clientX - this.drag.lastX;
      const dy = e.clientY - this.drag.lastY;
      const interval = Math.max((e.timeStamp - this.drag.lastTime) / 1000, MIN_EVENT_INTERVAL);
      this.drag.lastX = e.clientX;
      this.drag.lastY = e.clientY;
      this.drag.lastTime = e.timeStamp;
      this.applyDrag(this.drag.ring, dx, dy, interval);
      return;
    }
    this.setHovered(this.pick(e.clientX, e.clientY));
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const press = this.press;
    if (!press || press.pointerId !== e.pointerId) return;
    this.endPress();
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) >= CLICK_THRESHOLD) return;

    const { target } = press;
    if (!target) {
      this.handlers.onBackgroundClick?.();
      return;
    }
    this.handlers.onRingClick?.(target.ring);
    if (target.node) this.handlers.onNodeClick?.(target.node);
  };

  /** The browser took the pointer (a touch scroll, for example): end the press without a click. */
  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.press?.pointerId === e.pointerId) this.endPress();
  };

  /** The pointer left the canvas, onto an overlay or out of the window. */
  private readonly onPointerLeave = (): void => {
    this.setHovered(null);
  };

  private endPress(): void {
    const press = this.press;
    if (press && this.canvas.hasPointerCapture(press.pointerId)) this.canvas.releasePointerCapture(press.pointerId);
    this.press = null;
    this.drag = null;
    this.updateCursor();
  }

  /**
   * Spin the dragged ring at the pointer's speed (dx px over `interval`
   * seconds). Tilt and the spin coupled into the other rings are impulses per
   * px moved, so the same gesture adds the same amount at any event rate.
   */
  private applyDrag(ring: OrbitalRing, dx: number, dy: number, interval: number): void {
    ring.angularVelocity = (dx * ORBIT_FORCE) / interval;
    ring.addTiltVelocity(dx * TILT_SCALE, -dy * TILT_SCALE);

    for (const other of this.rings) {
      if (other === ring) continue;
      const cf = other.config.couplingFactor;
      other.addVelocity(dx * COUPLED_SPIN_PER_PX * cf);
      other.addTiltVelocity(dx * TILT_SCALE * cf, -dy * TILT_SCALE * cf);
    }
  }

  private setHovered(target: PickTarget | null): void {
    const previous = this.hovered;
    this.hovered = target;
    if (previous?.ring !== target?.ring || previous?.node !== target?.node) this.handlers.onHover?.(target);
    this.updateCursor();
  }

  private updateCursor(): void {
    let cursor = 'default';
    if (this.drag) cursor = 'grabbing';
    else if (this.hovered?.node) cursor = 'pointer';
    else if (this.hovered) cursor = 'grab';
    this.canvas.style.cursor = cursor;
  }
}

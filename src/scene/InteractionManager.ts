import * as THREE from 'three';
import type { OrbitalRing } from './OrbitalRing';
import type { OrbitalNode } from './OrbitalNode';

export type HoverCallback = (node: OrbitalNode | null) => void;
export type RingHoverCallback = (ring: OrbitalRing | null) => void;
export type RingClickCallback = (ring: OrbitalRing) => void;

const CLICK_THRESHOLD = 5;

export class InteractionManager {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private rings: OrbitalRing[] = [];
  private camera: THREE.Camera;
  private canvas: HTMLCanvasElement;

  private isDragging = false;
  private dragPrevX = 0;
  private dragPrevY = 0;
  private dragStartX = 0;
  private dragStartY = 0;
  private activeRing: OrbitalRing | null = null;
  private hoveredRing: OrbitalRing | null = null;
  private hoveredNode: OrbitalNode | null = null;
  private onHoverChange: HoverCallback | null = null;
  private onRingHoverChange: RingHoverCallback | null = null;
  private onRingClick: RingClickCallback | null = null;

  constructor(camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerUp);
  }

  setRings(rings: OrbitalRing[]): void {
    this.rings = rings;
  }

  setHoverCallback(cb: HoverCallback): void {
    this.onHoverChange = cb;
  }

  setRingHoverCallback(cb: RingHoverCallback): void {
    this.onRingHoverChange = cb;
  }

  setRingClickCallback(cb: RingClickCallback): void {
    this.onRingClick = cb;
  }

  private updatePointer(e: PointerEvent): void {
    this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  private findRingUnderPointer(): OrbitalRing | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hitMeshes = this.rings.map(r => r.hitMesh);
    const intersects = this.raycaster.intersectObjects(hitMeshes, false);
    if (intersects.length === 0) return null;

    const hitId = intersects[0]!.object.userData['ringId'] as string | undefined;
    if (!hitId) return null;

    return this.rings.find(r => r.config.id === hitId) ?? null;
  }

  private findHoveredNode(): OrbitalNode | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const allMeshes = this.rings.flatMap(r => r.nodes.map(n => n.mesh));
    const intersects = this.raycaster.intersectObjects(allMeshes, false);
    if (intersects.length === 0) return null;

    const hit = intersects[0]!;
    const nodeId = hit.object.userData['nodeId'] as string | undefined;
    if (!nodeId) return null;

    for (const ring of this.rings) {
      for (const node of ring.nodes) {
        if (node.config.id === nodeId) return node;
      }
    }
    return null;
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.updatePointer(e);
    this.activeRing = this.findRingUnderPointer();
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    if (this.activeRing) {
      this.isDragging = true;
      this.dragPrevX = e.clientX;
      this.dragPrevY = e.clientY;
      this.activeRing.setHighlighted(true);
      this.canvas.style.cursor = 'grabbing';
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    this.updatePointer(e);

    if (this.isDragging && this.activeRing) {
      const dx = e.clientX - this.dragPrevX;
      const dy = e.clientY - this.dragPrevY;
      this.dragPrevX = e.clientX;
      this.dragPrevY = e.clientY;

      const orbitForce = dx * 0.008;
      this.activeRing.angularVelocity = orbitForce / 0.016;

      const tiltScale = 0.005;
      this.activeRing.addTiltVelocity(dx * tiltScale, -dy * tiltScale);

      for (const ring of this.rings) {
        if (ring !== this.activeRing) {
          const cf = ring.config.couplingFactor;
          ring.addVelocity(orbitForce * cf * 0.25 / 0.016);
          ring.addTiltVelocity(dx * tiltScale * cf, -dy * tiltScale * cf);
        }
      }
      return;
    }

    const node = this.findHoveredNode();
    if (node !== this.hoveredNode) {
      this.hoveredNode?.setHovered(false);
      node?.setHovered(true);
      this.hoveredNode = node;
      this.onHoverChange?.(node);
    }

    let ring = this.findRingUnderPointer();
    if (node) {
      const parentRing = this.rings.find(r => r.nodes.includes(node));
      if (parentRing) ring = parentRing;
    }
    if (ring !== this.hoveredRing) {
      if (this.hoveredRing && this.hoveredRing !== this.activeRing) {
        this.hoveredRing.setHighlighted(false);
      }
      this.hoveredRing = ring;
      if (ring) {
        ring.setHighlighted(true);
      }
      this.onRingHoverChange?.(ring);
    }

    if (this.hoveredNode) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.hoveredRing) {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = 'default';
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wasClick = dist < CLICK_THRESHOLD;

    if (wasClick && this.hoveredRing) {
      this.onRingClick?.(this.hoveredRing);
    }

    if (this.activeRing && this.activeRing !== this.hoveredRing) {
      this.activeRing.setHighlighted(false);
    }
    this.isDragging = false;
    this.activeRing = null;

    if (this.hoveredNode) {
      this.canvas.style.cursor = 'pointer';
    } else if (this.hoveredRing) {
      this.canvas.style.cursor = 'grab';
    } else {
      this.canvas.style.cursor = 'default';
    }
  };
}

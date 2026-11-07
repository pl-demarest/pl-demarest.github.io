import * as THREE from 'three';
import { OrbitalRing } from '../../../src/scene/OrbitalRing';
import { ORBITALS } from '../../../src/scene/config';

// Node-side model of the scene used to find screen targets (ring points,
// node centres, empty space). The camera constants mirror SceneManager's
// private DESKTOP_* / MOBILE_* values; keep them in step with src.

const FRAME_DT = 0.016; // Playwright's fake clock runs rAF every 16 ms.

export interface Viewport {
  width: number;
  height: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export class SceneModel {
  readonly camera: THREE.PerspectiveCamera;
  readonly rings: OrbitalRing[];

  constructor(
    private readonly viewport: Viewport,
    elapsedMs: number,
  ) {
    const mobile = viewport.width < 768;
    this.camera = new THREE.PerspectiveCamera(mobile ? 65 : 45, viewport.width / viewport.height, 0.1, 100);
    this.camera.position.set(0, mobile ? 7 : 5.5, mobile ? 14 : 8);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
    const frames = Math.round(elapsedMs / 16);
    for (const ring of this.rings) {
      for (let i = 0; i < frames; i++) ring.update(FRAME_DT);
      ring.group.updateMatrixWorld(true);
    }
  }

  ring(id: string): OrbitalRing {
    const r = this.rings.find(x => x.config.id === id);
    if (!r) throw new Error(`unknown ring ${id}`);
    return r;
  }

  toScreen(world: THREE.Vector3): ScreenPoint {
    const ndc = world.clone().project(this.camera);
    return {
      x: ((ndc.x + 1) / 2) * this.viewport.width,
      y: ((1 - ndc.y) / 2) * this.viewport.height,
    };
  }

  private raycast(p: ScreenPoint) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(
      new THREE.Vector2((p.x / this.viewport.width) * 2 - 1, -(p.y / this.viewport.height) * 2 + 1),
      this.camera,
    );
    return {
      ring: ray.intersectObjects(this.rings.map(r => r.hitMesh), false)[0],
      node: ray.intersectObjects(this.rings.flatMap(r => r.nodes.map(n => n.mesh)), false)[0],
    };
  }

  /** True when nothing pickable (ring tube or node) is under the point. */
  isEmpty(p: ScreenPoint): boolean {
    const hit = this.raycast(p);
    return !hit.ring && !hit.node;
  }

  /**
   * A point on the ring's ellipse, at least `margin` px inside the viewport and
   * left of `maxX`, where this ring is the first hit and no node is near.
   */
  ringPoint(id: string, { maxX = Infinity, margin = 40 } = {}): ScreenPoint {
    const ring = this.ring(id);
    const { radiusX, radiusY } = ring.config;
    for (let k = 0; k < 128; k++) {
      const theta = (k / 128) * Math.PI * 2;
      const local = new THREE.Vector3(Math.cos(theta) * radiusX, 0, Math.sin(theta) * radiusY);
      const p = this.toScreen(ring.group.localToWorld(local));
      if (p.x < margin || p.y < margin || p.x > Math.min(maxX, this.viewport.width - margin)) continue;
      if (p.y > this.viewport.height - margin) continue;
      const hit = this.raycast(p);
      const clearOfNodes = [-12, 0, 12].every(
        dx => [-12, 0, 12].every(dy => !this.raycast({ x: p.x + dx, y: p.y + dy }).node),
      );
      if (hit.ring?.object === ring.hitMesh && clearOfNodes) return p;
    }
    throw new Error(`no clear point on ring ${id}`);
  }

  /** Screen position of a node's centre; throws unless that node is the first node hit there. */
  nodePoint(nodeId: string): ScreenPoint {
    for (const ring of this.rings) {
      const node = ring.findNodeById(nodeId);
      if (!node) continue;
      const p = this.toScreen(node.mesh.getWorldPosition(new THREE.Vector3()));
      if (this.raycast(p).node?.object !== node.mesh) throw new Error(`node ${nodeId} is occluded`);
      return p;
    }
    throw new Error(`unknown node ${nodeId}`);
  }
}

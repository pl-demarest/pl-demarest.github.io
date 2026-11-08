import * as THREE from 'three';
import { OrbitalRing } from '../../../src/scene/OrbitalRing';
import { cameraPresetFor } from '../../../src/scene/SceneManager';
import { ORBITALS } from '../../../src/scene/config';
import { orbitAngle } from './sceneProbe';

// Node-side model of the scene used to find screen targets (ring points,
// node centres, empty space), with SceneManager's own camera presets.

// The fixture reports each 16 ms fake-clock frame to the scene as 1/60 s.
const FRAME_DT = 1 / 60;

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
    const preset = cameraPresetFor(viewport.width);
    this.camera = new THREE.PerspectiveCamera(preset.fov, viewport.width / viewport.height, 0.1, 100);
    this.camera.position.set(...preset.position);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld();

    this.rings = ORBITALS.map(cfg => new OrbitalRing(cfg));
    this.step(Math.round(elapsedMs / 16));
  }

  /** Advance every ring `frames` frames, as the page does in frames x 16 ms of fake time. */
  step(frames: number): void {
    for (const ring of this.rings) {
      for (let i = 0; i < frames; i++) ring.update(FRAME_DT);
      ring.group.updateMatrixWorld(true);
    }
  }

  /**
   * One pointer move of a drag on ring `id`, `dx` and `dy` CSS px over
   * `interval` seconds since the previous event, turned into spin and tilt
   * as InteractionManager's applyDrag does (its constants, copied here; the
   * unit tests pin the same values).
   */
  dragMove(id: string, dx: number, dy: number, interval: number): void {
    const ORBIT_FORCE = 0.008;
    const COUPLED_SPIN_PER_PX = (ORBIT_FORCE * 0.25) / 0.016;
    const TILT_SCALE = 0.005;
    const dragged = this.ring(id);
    dragged.angularVelocity = (dx * ORBIT_FORCE) / interval;
    dragged.addTiltVelocity(dx * TILT_SCALE, -dy * TILT_SCALE);
    for (const ring of this.rings) {
      if (ring === dragged) continue;
      const k = ring.config.couplingFactor;
      ring.addVelocity(dx * COUPLED_SPIN_PER_PX * k);
      ring.addTiltVelocity(dx * TILT_SCALE * k, -dy * TILT_SCALE * k);
    }
  }

  /** The ring's orbit angle in (-pi, pi], read from its first node as the scene probe reads it. */
  ringAngle(id: string): number {
    const node = this.ring(id).nodes[0]!;
    return orbitAngle(node.config.id, { x: node.mesh.position.x, z: node.mesh.position.z });
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

  /** Screen position of a node's centre, whatever lies in front of it. */
  nodeScreen(nodeId: string): ScreenPoint {
    const node = this.rings.flatMap(r => r.nodes).find(n => n.config.id === nodeId);
    if (!node) throw new Error(`unknown node ${nodeId}`);
    return this.toScreen(node.mesh.getWorldPosition(new THREE.Vector3()));
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

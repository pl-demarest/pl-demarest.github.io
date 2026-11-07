import * as THREE from 'three';
import { type OrbitalConfig } from './config';
import { OrbitalNode } from './OrbitalNode';
import { damp, lerpToward } from './physics';

const CURVE_POINTS = 128;
const HIT_TUBE_RADIUS = 0.35;
// Per-frame constants tuned at 60 Hz; physics.ts applies them per second.
const FRICTION = 0.97;
const LERP_SPEED = 0.06;
const FLAT_LERP_SPEED = 0.18;
/** Below half the return speed, the spin is pulled back toward it at this rate. */
const RETURN_RATE = 0.01;
/** A flat ring snaps face-on once both tilt angles are this close, in radians. */
const FLAT_SNAP = 0.001;

/**
 * Friction and the return pull balance where
 * v = RETURN_RATE * s / (1 - FRICTION * (1 - RETURN_RATE)), about 0.25189 s
 * at 60 Hz: a ring whose return speed is s cruises at this ratio of s.
 */
export const CRUISE_RATIO = RETURN_RATE / (1 - FRICTION * (1 - RETURN_RATE));

export class OrbitalRing {
  readonly group: THREE.Group;
  readonly nodes: OrbitalNode[];
  readonly config: OrbitalConfig;
  readonly hitMesh: THREE.Mesh;
  /**
   * The spin the ring starts with and is pulled back toward, in rad/s:
   * config.speed (the cruise the viewer sees) divided by CRUISE_RATIO.
   */
  readonly returnSpeed: number;

  private readonly line: THREE.Line;

  private angle = 0;
  private _angularVelocity: number;
  private _tiltVelocityX = 0;
  private _tiltVelocityZ = 0;

  private flatMode = false;
  /** False under prefers-reduced-motion: the ring turns only when dragged. */
  private autoRotate = true;
  private targetRotX: number;
  private targetRotZ: number;

  constructor(config: OrbitalConfig) {
    this.config = config;
    this.group = new THREE.Group();
    this.returnSpeed = config.speed / CRUISE_RATIO;
    this._angularVelocity = this.returnSpeed;
    this.targetRotX = config.tilt.x;
    this.targetRotZ = config.tilt.z;

    const ellipse = new THREE.EllipseCurve(
      0, 0,
      config.radiusX, config.radiusY,
      0, 2 * Math.PI,
      false, 0,
    );

    const points = ellipse
      .getPoints(CURVE_POINTS)
      .map(p => new THREE.Vector3(p.x, 0, p.y));
    points.push(points[0]!.clone());

    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 1 });
    this.line = new THREE.Line(lineGeom, lineMat);
    this.group.add(this.line);

    const path = new THREE.CatmullRomCurve3(points, true);
    const tubeGeom = new THREE.TubeGeometry(path, CURVE_POINTS, HIT_TUBE_RADIUS, 6, true);
    const tubeMat = new THREE.MeshBasicMaterial({
      visible: false,
    });
    this.hitMesh = new THREE.Mesh(tubeGeom, tubeMat);
    this.hitMesh.userData = { ringId: config.id };
    this.group.add(this.hitMesh);

    this.group.rotation.x = config.tilt.x;
    this.group.rotation.z = config.tilt.z;

    this.nodes = config.nodes.map(nc => {
      const node = new OrbitalNode(nc);
      this.group.add(node.mesh);
      return node;
    });
  }

  setFlatView(flat: boolean): void {
    this.flatMode = flat;
    if (flat) {
      this.targetRotX = Math.PI / 2;
      this.targetRotZ = 0;
      this._tiltVelocityX = 0;
      this._tiltVelocityZ = 0;
      this._angularVelocity = 0;
    } else {
      this.targetRotX = this.config.tilt.x;
      this.targetRotZ = this.config.tilt.z;
      this._angularVelocity = this.autoRotate ? this.returnSpeed : 0;
    }
  }

  /**
   * Turn the ring's own rotation on or off. Off stops it now and leaves only
   * drags to move it; on relaunches it at its return speed.
   */
  setAutoRotate(enabled: boolean): void {
    if (enabled === this.autoRotate) return;
    this.autoRotate = enabled;
    if (!this.flatMode) this._angularVelocity = enabled ? this.returnSpeed : 0;
  }

  get isFlatMode(): boolean {
    return this.flatMode;
  }

  get angularVelocity(): number {
    return this._angularVelocity;
  }

  /** Set the spin directly, as a drag on this ring does. A flat ring then coasts to rest. */
  set angularVelocity(v: number) {
    this._angularVelocity = v;
  }

  /** Add spin coupled in from a drag on another ring. A flat ring does not take it. */
  addVelocity(delta: number): void {
    if (this.flatMode) return;
    this._angularVelocity += delta;
  }

  addTiltVelocity(dx: number, dy: number): void {
    if (this.flatMode) return;
    this._tiltVelocityX += dy;
    this._tiltVelocityZ += dx;
  }

  findNodeById(id: string): OrbitalNode | undefined {
    return this.nodes.find(n => n.config.id === id);
  }

  /** Advance the ring by dt seconds. */
  update(dt: number): void {
    const rotation = this.group.rotation;
    if (this.flatMode) {
      const dx = this.targetRotX - rotation.x;
      const dz = this.targetRotZ - rotation.z;
      if (Math.abs(dx) < FLAT_SNAP && Math.abs(dz) < FLAT_SNAP) {
        rotation.x = this.targetRotX;
        rotation.z = this.targetRotZ;
      } else {
        rotation.x = lerpToward(rotation.x, this.targetRotX, FLAT_LERP_SPEED, dt);
        rotation.z = lerpToward(rotation.z, this.targetRotZ, FLAT_LERP_SPEED, dt);
      }
      // A flat ring turns only when dragged directly, and coasts to rest
      // without returning to its cruise.
      this._angularVelocity = damp(this._angularVelocity, FRICTION, dt);
    } else {
      rotation.x = lerpToward(rotation.x, this.targetRotX, LERP_SPEED, dt);
      rotation.z = lerpToward(rotation.z, this.targetRotZ, LERP_SPEED, dt);

      rotation.x += this._tiltVelocityX * dt;
      rotation.z += this._tiltVelocityZ * dt;
      this._tiltVelocityX = damp(this._tiltVelocityX, FRICTION, dt);
      this._tiltVelocityZ = damp(this._tiltVelocityZ, FRICTION, dt);

      this._angularVelocity = damp(this._angularVelocity, FRICTION, dt);
      if (this.autoRotate && Math.abs(this._angularVelocity) < Math.abs(this.returnSpeed) * 0.5) {
        this._angularVelocity = lerpToward(this._angularVelocity, this.returnSpeed, RETURN_RATE, dt);
      }
    }

    this.angle += this._angularVelocity * dt;

    for (const node of this.nodes) {
      const t = this.angle + node.config.angleOffset;
      const px = Math.cos(t) * this.config.radiusX;
      const pz = Math.sin(t) * this.config.radiusY;
      node.mesh.position.set(px, 0, pz);
      node.update(dt);
    }
  }

  /** Remove the ring from its parent and release its geometries and materials. */
  dispose(): void {
    this.group.removeFromParent();
    for (const object of [this.line, this.hitMesh]) {
      object.geometry.dispose();
      (object.material as THREE.Material).dispose();
    }
    for (const node of this.nodes) node.dispose();
  }
}

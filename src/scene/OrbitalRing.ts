import * as THREE from 'three';
import { type OrbitalConfig } from './config';
import { OrbitalNode } from './OrbitalNode';

const CURVE_POINTS = 128;
const FRICTION = 0.97;
const HIT_TUBE_RADIUS = 0.35;
const LERP_SPEED = 0.06;
const FLAT_LERP_SPEED = 0.18;

export class OrbitalRing {
  readonly group: THREE.Group;
  readonly nodes: OrbitalNode[];
  readonly config: OrbitalConfig;
  readonly hitMesh: THREE.Mesh;

  private angle = 0;
  private _angularVelocity: number;
  private _tiltVelocityX = 0;
  private _tiltVelocityZ = 0;

  private flatMode = false;
  private targetRotX: number;
  private targetRotZ: number;

  constructor(config: OrbitalConfig) {
    this.config = config;
    this.group = new THREE.Group();
    this._angularVelocity = config.speed;
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
    const line = new THREE.Line(lineGeom, lineMat);
    this.group.add(line);

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

  setHighlighted(_active: boolean): void {
    // reserved for future use
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
      this._angularVelocity = this.config.speed;
    }
  }

  get isFlatMode(): boolean {
    return this.flatMode;
  }

  get angularVelocity(): number {
    return this._angularVelocity;
  }

  set angularVelocity(v: number) {
    this._angularVelocity = v;
  }

  addVelocity(delta: number): void {
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

  update(dt: number): void {
    if (this.flatMode) {
      const dx = this.targetRotX - this.group.rotation.x;
      const dz = this.targetRotZ - this.group.rotation.z;
      if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) {
        this.group.rotation.x = this.targetRotX;
        this.group.rotation.z = this.targetRotZ;
      } else {
        this.group.rotation.x += dx * FLAT_LERP_SPEED;
        this.group.rotation.z += dz * FLAT_LERP_SPEED;
      }
    } else {
      this.group.rotation.x += (this.targetRotX - this.group.rotation.x) * LERP_SPEED;
      this.group.rotation.z += (this.targetRotZ - this.group.rotation.z) * LERP_SPEED;

      this.group.rotation.x += this._tiltVelocityX * dt;
      this.group.rotation.z += this._tiltVelocityZ * dt;
      this._tiltVelocityX *= FRICTION;
      this._tiltVelocityZ *= FRICTION;

      this._angularVelocity *= FRICTION;
      if (Math.abs(this._angularVelocity) < this.config.speed * 0.5) {
        this._angularVelocity +=
          (Math.sign(this.config.speed) * this.config.speed - this._angularVelocity) * 0.01;
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
}

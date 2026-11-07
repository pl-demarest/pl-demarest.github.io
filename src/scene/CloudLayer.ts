/**
 * CloudLayer: wireframe clouds drifting across the bottom of the scene.
 *
 * The geometry comes from a binary glTF (GLB) file exported by
 * cloud-designer (decision D3 of the 2026-11 refactor plan): every line-
 * segment primitive in the file (glTF mode LINES, loaded as
 * THREE.LineSegments) is merged into one edge buffer with its transform
 * applied. Each cloud instance draws that buffer as THREE.LineSegments with
 * one shared material, drifts from +spread to -spread along X and bobs on Y.
 *
 * Not wired into the app yet: content's CLOUDS.asset is null until a GLB
 * exists. Usage:
 *   const clouds = await loadCloudLayer(sm.scene, `${import.meta.env.BASE_URL}cloud.glb`);
 *   sm.onTick(dt => clouds.update(dt));
 */

import * as THREE from 'three';

export interface CloudLayerOptions {
  /** Number of cloud instances (default 3). */
  count?: number;
  /** Y of the clouds' baseline in world units (default -3). */
  baselineY?: number;
  /** Z of the clouds in world units (default -2). */
  depth?: number;
  /** Half-width of the drift band: clouds cross from +spread to -spread on X (default 14). */
  spread?: number;
  /** Drift speed in world units per second (default 0.4). */
  speed?: number;
  /** Y bob amplitude in world units (default 0.15). */
  bobAmplitude?: number;
  /** Y bob period in seconds (default 6). */
  bobPeriod?: number;
  /** Uniform scale of the cloud geometry (default 1). */
  scale?: number;
  /** Line opacity (default 0.6). */
  opacity?: number;
}

const DEFAULTS: Required<CloudLayerOptions> = {
  count: 3,
  baselineY: -3,
  depth: -2,
  spread: 14,
  speed: 0.4,
  bobAmplitude: 0.15,
  bobPeriod: 6,
  scale: 1,
  opacity: 0.6,
};

/**
 * X of cloud `index` (of `count`) at `time` seconds. Every cloud crosses
 * from +spread to -spread at `speed`, then wraps to +spread; the clouds are
 * spaced evenly along the band, the only stagger. The result is in
 * (-spread, spread] for any time, including negative times.
 */
export function cloudDriftX(time: number, index: number, count: number, spread: number, speed: number): number {
  const width = 2 * spread;
  const travelled = time * speed + (index / count) * width;
  const u = ((travelled % width) + width) % width;
  return spread - u;
}

/**
 * Merge every THREE.LineSegments under `root` into one position-only
 * geometry in `root`'s frame. Returns null when `root` holds no segments.
 */
export function mergeLineSegments(root: THREE.Object3D): THREE.BufferGeometry | null {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts: Float32Array[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();

  root.traverse(object => {
    if (!(object as THREE.LineSegments).isLineSegments) return;
    const { geometry } = object as THREE.LineSegments;
    const pairs = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = pairs.getAttribute('position');
    m.multiplyMatrices(toRoot, object.matrixWorld);
    const out = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(m);
      out[i * 3] = v.x;
      out[i * 3 + 1] = v.y;
      out[i * 3 + 2] = v.z;
    }
    if (pairs !== geometry) pairs.dispose();
    parts.push(out);
  });

  if (parts.length === 0) return null;
  const merged = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(merged, 3));
  return geometry;
}

export class CloudLayer {
  /** Holds every instance; loadCloudLayer adds it to the scene. */
  readonly group = new THREE.Group();
  readonly instances: readonly THREE.LineSegments[];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.LineBasicMaterial;
  private readonly options: Required<CloudLayerOptions>;
  private time = 0;

  /** Takes ownership of `geometry`: line-segment pairs, as mergeLineSegments returns them. */
  constructor(geometry: THREE.BufferGeometry, options: CloudLayerOptions = {}) {
    this.geometry = geometry;
    this.options = { ...DEFAULTS, ...options };
    this.material = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: this.options.opacity });
    const instances: THREE.LineSegments[] = [];
    for (let i = 0; i < this.options.count; i++) {
      const instance = new THREE.LineSegments(geometry, this.material);
      instance.scale.setScalar(this.options.scale);
      this.group.add(instance);
      instances.push(instance);
    }
    this.instances = instances;
    this.place();
  }

  /** Advance the drift by dt seconds. */
  update(dt: number): void {
    this.time += dt;
    this.place();
  }

  /** Remove the layer from its parent and release the shared geometry and material. */
  dispose(): void {
    this.group.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }

  private place(): void {
    const { count, spread, speed, depth, baselineY, bobAmplitude, bobPeriod } = this.options;
    this.instances.forEach((instance, i) => {
      // A sine bob on Y, phase-shifted per cloud.
      const bob = Math.sin((this.time / bobPeriod + i / count) * Math.PI * 2) * bobAmplitude;
      instance.position.set(cloudDriftX(this.time, i, count, spread, speed), baselineY + bob, depth);
    });
  }
}

/**
 * Load a cloud-designer GLB from `url` and add a CloudLayer built from its
 * line segments to `scene`. GLTFLoader is imported on first use, so pages
 * without clouds do not download it. Rejects when the file has no line
 * segments.
 */
export async function loadCloudLayer(scene: THREE.Scene, url: string, options: CloudLayerOptions = {}): Promise<CloudLayer> {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url);
  const geometry = mergeLineSegments(gltf.scene);
  if (!geometry) throw new Error(`${url} has no line segments to draw as clouds`);
  const layer = new CloudLayer(geometry, options);
  scene.add(layer.group);
  return layer;
}

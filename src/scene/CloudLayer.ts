/**
 * CloudLayer — Eastern-style wireframe clouds drifting across the scene bottom.
 *
 * Reads a CloudPreset JSON (exported from cloud-designer) and reconstructs
 * the cloud geometry for runtime display. Clouds drift horizontally and have
 * a gentle sine Y oscillation. Multiple instances are staggered automatically.
 *
 * Usage:
 *   import cloudPreset from '../../public/cloud-preset.json';
 *   const clouds = new CloudLayer(cloudPreset, scene, { count: 3 });
 *   // in animation loop:
 *   clouds.update(dt);
 */

import * as THREE from 'three';

// Minimal subset of the CloudPreset type we need at runtime
interface SwirlDef {
  position: [number, number, number];
  radius: number;
  falloff: number;
  shape: 'sphere' | 'ellipsoid';
  scale: [number, number, number];
}

interface MergeSettings {
  resolution: number;
  threshold: number;
  wireframe: {
    mode: 'edges' | 'spiral';
    frontPoint: [number, number, number];
    backPoint: [number, number, number];
    numBands: number;
    numFlowLines: number;
    spiralTwist: number;
    showBands: boolean;
    showFlowLines: boolean;
  };
}

interface CloudPreset {
  swirls: SwirlDef[];
  merge: MergeSettings;
}

export interface CloudLayerOptions {
  /** Number of cloud instances to spawn (default 3) */
  count?: number;
  /** World-space Y position of the cloud baseline (default -3) */
  baselineY?: number;
  /** Horizontal spread (clouds drift from +spread to -spread on X, default 14) */
  spread?: number;
  /** Drift speed in world units/second (default 0.4) */
  speed?: number;
  /** Y-oscillation amplitude (default 0.15) */
  oscAmp?: number;
  /** Y-oscillation period in seconds (default 6) */
  oscPeriod?: number;
  /** Scale applied to the cloud geometry (default 1) */
  scale?: number;
}

const WIRE_MAT = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 });

interface CloudInstance {
  group: THREE.Group;
  offsetX: number;   // initial X phase offset
  time: number;      // per-instance elapsed time
  oscPhase: number;  // Y oscillation phase offset
}

export class CloudLayer {
  private scene: THREE.Scene;
  private instances: CloudInstance[] = [];
  private geometry: THREE.BufferGeometry | null = null;

  private spread: number;
  private speed: number;
  private baselineY: number;
  private oscAmp: number;
  private oscPeriod: number;

  constructor(preset: CloudPreset, scene: THREE.Scene, options: CloudLayerOptions = {}) {
    this.scene = scene;
    const {
      count = 3,
      baselineY = -3,
      spread = 14,
      speed = 0.4,
      oscAmp = 0.15,
      oscPeriod = 6,
      scale = 1,
    } = options;

    this.spread = spread;
    this.speed = speed;
    this.baselineY = baselineY;
    this.oscAmp = oscAmp;
    this.oscPeriod = oscPeriod;

    // Build geometry once from preset
    this.geometry = this.buildGeometry(preset);

    // Spawn instances staggered across the X range
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      group.scale.setScalar(scale);

      if (this.geometry) {
        const line = new THREE.Line(this.geometry, WIRE_MAT.clone());
        group.add(line);
      }

      scene.add(group);

      const offsetX = (i / count) * spread * 2 - spread;
      this.instances.push({
        group,
        offsetX,
        time: (i / count) * ((spread * 2) / speed), // stagger start
        oscPhase: (i / count) * Math.PI * 2,
      });
    }
  }

  update(dt: number): void {
    for (const inst of this.instances) {
      inst.time += dt;

      // Drift X from +spread to -spread, then wrap
      const totalCycle = (this.spread * 2) / this.speed;
      const t = (inst.time % totalCycle) / totalCycle;
      const x = this.spread - t * this.spread * 2 + inst.offsetX;

      // Clamp wrap
      const wrappedX = ((x + this.spread) % (this.spread * 2)) - this.spread;

      // Y oscillation
      const y = this.baselineY + Math.sin(
        (inst.time / this.oscPeriod) * Math.PI * 2 + inst.oscPhase
      ) * this.oscAmp;

      inst.group.position.set(wrappedX, y, -2);
    }
  }

  /**
   * Build a simple EdgesGeometry from the swirl definitions.
   * For a fully detailed cloud matching the designer's output, export a GLB
   * and load it with GLTFLoader instead.
   */
  private buildGeometry(preset: CloudPreset): THREE.BufferGeometry | null {
    if (preset.swirls.length === 0) return null;

    // Build approximate geometry from swirl spheres
    const mergedGeo = new THREE.BufferGeometry();
    const allPositions: number[] = [];
    const allIndices: number[] = [];
    let baseIdx = 0;

    for (const sw of preset.swirls) {
      const geo = new THREE.SphereGeometry(sw.radius, 10, 7);
      if (sw.shape === 'ellipsoid') {
        geo.scale(sw.scale[0], sw.scale[1], sw.scale[2]);
      }
      geo.translate(...sw.position);

      const pos = geo.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        allPositions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      }

      const idx = geo.getIndex();
      if (idx) {
        for (let i = 0; i < idx.count; i++) {
          allIndices.push(idx.getX(i) + baseIdx);
        }
      }
      baseIdx += pos.count;
      geo.dispose();
    }

    mergedGeo.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    mergedGeo.setIndex(allIndices);
    mergedGeo.computeVertexNormals();

    const edges = new THREE.EdgesGeometry(mergedGeo, 15);
    mergedGeo.dispose();
    return edges;
  }

  dispose(): void {
    for (const inst of this.instances) {
      this.scene.remove(inst.group);
      inst.group.traverse((child) => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    this.geometry?.dispose();
    this.instances = [];
  }
}

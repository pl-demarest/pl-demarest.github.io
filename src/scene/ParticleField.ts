import * as THREE from 'three';
import { PARTICLE_CONFIG } from './config';
import { TUNED_HZ } from './physics';

/** A source of uniform random numbers in [0, 1), as Math.random is. */
export type RandomSource = () => number;

export class ParticleField {
  readonly backgroundGroup: THREE.Points;
  readonly foregroundGroup: THREE.Points;

  /** Drift per 60 Hz frame, in world units; update() scales it by the step. */
  private bgVelocities: Float32Array;
  private fgVelocities: Float32Array;
  /** False under prefers-reduced-motion. */
  private drifting = true;

  /**
   * Lays both layers out from `random`: the background takes the first
   * 5 x backgroundCount draws, the foreground the next 5 x foregroundCount.
   * The app passes Math.random; tests pass a seeded source, so the layout
   * does not depend on what else drew from Math.random (three.js draws from
   * it for every object's UUID).
   */
  constructor(random: RandomSource = Math.random) {
    const { backgroundCount, foregroundCount, backgroundDepthRange, foregroundDepthRange, spread, driftSpeed } =
      PARTICLE_CONFIG;

    const bgResult = ParticleField.createLayer(random, backgroundCount, spread, backgroundDepthRange, driftSpeed, 0.6);
    this.backgroundGroup = bgResult.points;
    this.bgVelocities = bgResult.velocities;

    const fgResult = ParticleField.createLayer(random, foregroundCount, spread, foregroundDepthRange, driftSpeed * 1.5, 0.25);
    this.foregroundGroup = fgResult.points;
    this.fgVelocities = fgResult.velocities;
  }

  private static createLayer(
    random: RandomSource,
    count: number,
    spread: number,
    depthRange: [number, number],
    speed: number,
    opacity: number,
  ): { points: THREE.Points; velocities: Float32Array } {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      positions[i3] = (random() - 0.5) * spread;
      positions[i3 + 1] = (random() - 0.5) * spread;
      positions[i3 + 2] = depthRange[0] + random() * (depthRange[1] - depthRange[0]);

      velocities[i3] = (random() - 0.5) * speed;
      velocities[i3 + 1] = (random() - 0.5) * speed;
      velocities[i3 + 2] = 0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x000000,
      size: 0.06,
      transparent: true,
      opacity,
      sizeAttenuation: true,
    });

    return { points: new THREE.Points(geometry, material), velocities };
  }

  /** Pause or resume the drift. */
  setDrifting(enabled: boolean): void {
    this.drifting = enabled;
  }

  /** Advance the drift by dt seconds. */
  update(dt: number): void {
    if (!this.drifting) return;
    const frames = dt * TUNED_HZ;
    this.drift(this.backgroundGroup, this.bgVelocities, frames);
    this.drift(this.foregroundGroup, this.fgVelocities, frames);
  }

  private drift(points: THREE.Points, velocities: Float32Array, frames: number): void {
    const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const half = PARTICLE_CONFIG.spread / 2;

    for (let i = 0; i < arr.length; i += 3) {
      let x = arr[i]! + velocities[i]! * frames;
      let y = arr[i + 1]! + velocities[i + 1]! * frames;

      if (x > half) x -= PARTICLE_CONFIG.spread;
      if (x < -half) x += PARTICLE_CONFIG.spread;
      if (y > half) y -= PARTICLE_CONFIG.spread;
      if (y < -half) y += PARTICLE_CONFIG.spread;

      arr[i] = x;
      arr[i + 1] = y;
    }

    pos.needsUpdate = true;
  }

  /** Remove both layers from their parent and release their geometries and materials. */
  dispose(): void {
    for (const points of [this.backgroundGroup, this.foregroundGroup]) {
      points.removeFromParent();
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
    }
  }
}

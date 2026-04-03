import * as THREE from 'three';
import { PARTICLE_CONFIG } from './config';

export class ParticleField {
  readonly backgroundGroup: THREE.Points;
  readonly foregroundGroup: THREE.Points;

  private bgVelocities: Float32Array;
  private fgVelocities: Float32Array;

  constructor() {
    const { backgroundCount, foregroundCount, backgroundDepthRange, foregroundDepthRange, spread, driftSpeed } =
      PARTICLE_CONFIG;

    const bgResult = ParticleField.createLayer(backgroundCount, spread, backgroundDepthRange, driftSpeed, 0.6);
    this.backgroundGroup = bgResult.points;
    this.bgVelocities = bgResult.velocities;

    const fgResult = ParticleField.createLayer(foregroundCount, spread, foregroundDepthRange, driftSpeed * 1.5, 0.25);
    this.foregroundGroup = fgResult.points;
    this.fgVelocities = fgResult.velocities;
  }

  private static createLayer(
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
      positions[i3] = (Math.random() - 0.5) * spread;
      positions[i3 + 1] = (Math.random() - 0.5) * spread;
      positions[i3 + 2] = depthRange[0] + Math.random() * (depthRange[1] - depthRange[0]);

      velocities[i3] = (Math.random() - 0.5) * speed;
      velocities[i3 + 1] = (Math.random() - 0.5) * speed;
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

  update(_dt: number): void {
    this.drift(this.backgroundGroup, this.bgVelocities);
    this.drift(this.foregroundGroup, this.fgVelocities);
  }

  private drift(points: THREE.Points, velocities: Float32Array): void {
    const pos = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const half = PARTICLE_CONFIG.spread / 2;

    for (let i = 0; i < arr.length; i += 3) {
      let x = arr[i]! + velocities[i]!;
      let y = arr[i + 1]! + velocities[i + 1]!;

      if (x > half) x -= PARTICLE_CONFIG.spread;
      if (x < -half) x += PARTICLE_CONFIG.spread;
      if (y > half) y -= PARTICLE_CONFIG.spread;
      if (y < -half) y += PARTICLE_CONFIG.spread;

      arr[i] = x;
      arr[i + 1] = y;
    }

    pos.needsUpdate = true;
  }
}

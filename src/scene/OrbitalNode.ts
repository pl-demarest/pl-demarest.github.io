import * as THREE from 'three';
import { NODE_RADIUS, type NodeConfig } from './config';
import { lerpToward } from './physics';

const W_SEGMENTS = 8;
const H_SEGMENTS = 6;
/** Share of the remaining hover-scale change covered per 60 Hz frame. */
const SCALE_EASE = 0.12;
const COLOR_DEFAULT = new THREE.Color(0x000000);
const COLOR_HIGHLIGHT = new THREE.Color(0xa27fb8);

export class OrbitalNode {
  readonly mesh: THREE.Mesh;
  readonly config: NodeConfig;

  private baseScale = 1;
  private targetScale = 1;
  private hovered = false;
  private selected = false;
  private material: THREE.MeshBasicMaterial;

  constructor(config: NodeConfig) {
    this.config = config;

    const geometry = new THREE.SphereGeometry(NODE_RADIUS, W_SEGMENTS, H_SEGMENTS);
    this.material = new THREE.MeshBasicMaterial({
      color: COLOR_DEFAULT,
      wireframe: true,
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.userData = { nodeId: config.id };
  }

  setHovered(hovered: boolean): void {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.updateVisual();
  }

  setSelected(selected: boolean): void {
    if (this.selected === selected) return;
    this.selected = selected;
    this.updateVisual();
  }

  private updateVisual(): void {
    this.targetScale = this.hovered ? 1.3 : 1;
    this.material.color.copy(this.hovered || this.selected ? COLOR_HIGHLIGHT : COLOR_DEFAULT);
  }

  update(dt: number): void {
    this.baseScale = lerpToward(this.baseScale, this.targetScale, SCALE_EASE, dt);
    this.mesh.scale.setScalar(this.baseScale);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

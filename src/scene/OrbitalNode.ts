import * as THREE from 'three';
import { NODE_RADIUS, type NodeConfig } from './config';
import { lerpToward } from './physics';

const W_SEGMENTS = 8;
const H_SEGMENTS = 6;
/** Share of the remaining hover-scale change covered per 60 Hz frame. */
const SCALE_EASE = 0.12;
const COLOR_DEFAULT = new THREE.Color(0x000000);
const COLOR_HIGHLIGHT = new THREE.Color(0xa27fb8);

/** Every node is the same sphere, so all nodes share one geometry. */
let sharedGeometry: THREE.SphereGeometry | null = null;

function nodeGeometry(): THREE.SphereGeometry {
  return (sharedGeometry ??= new THREE.SphereGeometry(NODE_RADIUS, W_SEGMENTS, H_SEGMENTS));
}

/**
 * Release the shared node geometry once every node using it is disposed.
 * Nodes created afterwards get a new one.
 */
export function disposeNodeGeometry(): void {
  sharedGeometry?.dispose();
  sharedGeometry = null;
}

export class OrbitalNode {
  readonly mesh: THREE.Mesh;
  readonly config: NodeConfig;

  private baseScale = 1;
  private targetScale = 1;
  private hovered = false;
  private selected = false;
  /** False under prefers-reduced-motion: the hover scale snaps instead of easing. */
  private easing = true;
  private material: THREE.MeshBasicMaterial;

  constructor(config: NodeConfig) {
    this.config = config;

    this.material = new THREE.MeshBasicMaterial({
      color: COLOR_DEFAULT,
      wireframe: true,
    });

    this.mesh = new THREE.Mesh(nodeGeometry(), this.material);
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

  /** Ease the hover scale (the default), or snap it, as prefers-reduced-motion asks. */
  setEasing(enabled: boolean): void {
    this.easing = enabled;
  }

  private updateVisual(): void {
    this.targetScale = this.hovered ? 1.3 : 1;
    this.material.color.copy(this.hovered || this.selected ? COLOR_HIGHLIGHT : COLOR_DEFAULT);
  }

  update(dt: number): void {
    this.baseScale = this.easing ? lerpToward(this.baseScale, this.targetScale, SCALE_EASE, dt) : this.targetScale;
    this.mesh.scale.setScalar(this.baseScale);
  }

  /** Release this node's material; the shared geometry goes with disposeNodeGeometry(). */
  dispose(): void {
    this.material.dispose();
  }
}

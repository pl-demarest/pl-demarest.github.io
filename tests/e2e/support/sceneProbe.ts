import type { Page } from '@playwright/test';
import type * as THREE from 'three';
import { ORBITALS } from '../../../src/scene/config';

// A test-only view of the page's three.js scene, so browser tests can assert
// ring angles, tilts and node positions directly instead of through pixels.
// three.js announces every Scene and WebGLRenderer it creates to
// window.__THREE_DEVTOOLS__ (an 'observe' event, the hook the three.js
// developer tools use). The init script listens there, keeps the scene, and
// wraps renderer.render to keep the camera of the last frame drawn.

export interface RingState {
  /** The ring group's rotation, in radians (OrbitalRing tilts it with these). */
  rotationX: number;
  rotationZ: number;
}

export interface NodeState {
  /** Position on its ring, in the ring group's frame. */
  local: { x: number; z: number };
  /** Centre on the page in CSS px, through the camera of the last frame drawn. */
  screen: { x: number; y: number };
  /** Uniform scale: 1 at rest, 1.3 when hovered. */
  scale: number;
  /** Material colour as 0xRRGGBB. */
  color: number;
}

export interface SceneState {
  /** By ring id. */
  rings: Record<string, RingState>;
  /** By node id. */
  nodes: Record<string, NodeState>;
}

interface ProbeWindow {
  __THREE_DEVTOOLS__?: EventTarget;
  __SCENE_PROBE__?: { scene: THREE.Scene | null; camera: THREE.Camera | null };
}

/** Register the probe. Call before page.goto: three.js looks for the hook as it loads. */
export async function installSceneProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe: NonNullable<ProbeWindow['__SCENE_PROBE__']> = { scene: null, camera: null };
    const hook = new EventTarget();
    hook.addEventListener('observe', event => {
      const object = (event as CustomEvent<THREE.Scene | THREE.WebGLRenderer>).detail;
      if ((object as THREE.Scene).isScene) {
        probe.scene = object as THREE.Scene;
        return;
      }
      const renderer = object as THREE.WebGLRenderer;
      if (typeof renderer.render !== 'function' || !renderer.domElement) return;
      const render = renderer.render;
      renderer.render = function (this: THREE.WebGLRenderer, scene: THREE.Object3D, camera: THREE.Camera) {
        probe.camera = camera;
        render.call(this, scene, camera);
      };
    });
    const win = window as unknown as ProbeWindow;
    win.__THREE_DEVTOOLS__ = hook;
    win.__SCENE_PROBE__ = probe;
  });
}

/** Read the rings and nodes of the page's scene as it was last drawn. */
export async function readScene(page: Page): Promise<SceneState> {
  return page.evaluate(() => {
    const probe = (window as unknown as ProbeWindow).__SCENE_PROBE__;
    if (!probe?.scene) throw new Error('scene probe: no three.js scene was observed');
    if (!probe.camera) throw new Error('scene probe: no frame has been drawn yet');
    const { scene, camera } = probe;
    const rect = document.getElementById('scene')!.getBoundingClientRect();
    scene.updateMatrixWorld(true);

    const state: SceneState = { rings: {}, nodes: {} };
    scene.traverse(object => {
      const { ringId, nodeId } = object.userData as { ringId?: string; nodeId?: string };
      if (ringId && object.parent) {
        state.rings[ringId] = { rotationX: object.parent.rotation.x, rotationZ: object.parent.rotation.z };
      }
      if (nodeId) {
        // A vector from the page's own three.js, which this script cannot import.
        const ndc = object.getWorldPosition(object.position.clone()).project(camera);
        state.nodes[nodeId] = {
          local: { x: object.position.x, z: object.position.z },
          screen: { x: rect.left + ((ndc.x + 1) / 2) * rect.width, y: rect.top + ((1 - ndc.y) / 2) * rect.height },
          scale: object.scale.x,
          color: ((object as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex(),
        };
      }
    });
    return state;
  });
}

/**
 * The orbit angle of the ring that carries `nodeId`, from the node's
 * position on it, as OrbitalRing places nodes: (cos(angle + offset) x
 * radiusX, sin(angle + offset) x radiusY). The result is in (-pi, pi].
 */
export function orbitAngle(nodeId: string, local: { x: number; z: number }): number {
  for (const ring of ORBITALS) {
    const node = ring.nodes.find(n => n.id === nodeId);
    if (!node) continue;
    return wrapAngle(Math.atan2(local.z / ring.radiusY, local.x / ring.radiusX) - node.angleOffset);
  }
  throw new Error(`unknown node ${nodeId}`);
}

/** The ring's orbit angle in a probed scene, read from its first node. */
export function ringAngle(state: SceneState, ringId: string): number {
  const ring = ORBITALS.find(o => o.id === ringId);
  const nodeId = ring?.nodes[0]?.id;
  const node = nodeId === undefined ? undefined : state.nodes[nodeId];
  if (!nodeId || !node) throw new Error(`no node of ring ${ringId} in the probed scene`);
  return orbitAngle(nodeId, node.local);
}

/** `a - b` wrapped to (-pi, pi]. */
export function angleBetween(a: number, b: number): number {
  return wrapAngle(a - b);
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

// @vitest-environment happy-dom
import type { Window as HappyWindow } from 'happy-dom';
import * as THREE from 'three';
import type * as ThreeModule from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { SECTIONS } from '../../src/content/site';
import { OrbitalNode } from '../../src/scene/OrbitalNode';
import { OrbitalRing } from '../../src/scene/OrbitalRing';
import { cameraPresetFor } from '../../src/scene/SceneManager';
import { ORBITALS } from '../../src/scene/config';

// happy-dom has no WebGL, so the renderer is stubbed; everything else is
// real. The stub records the loop and the scene it is asked to render, and
// throws when `renderer.fail` is set, as WebGLRenderer does without WebGL.
const renderer = vi.hoisted(() => ({
  fail: false,
  loop: null as ((time: number) => void) | null,
  scene: null as ThreeModule.Scene | null,
  camera: null as ThreeModule.Camera | null,
  loopCalls: [] as Array<unknown>,
  disposed: 0,
}));

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof ThreeModule>();
  class StubRenderer {
    constructor() {
      if (renderer.fail) throw new Error('Error creating WebGL context.');
    }
    setPixelRatio(): void {}
    setSize(): void {}
    setAnimationLoop(loop: ((time: number) => void) | null): void {
      renderer.loopCalls.push(loop);
      renderer.loop = loop;
    }
    render(scene: ThreeModule.Scene, camera: ThreeModule.Camera): void {
      renderer.scene = scene;
      renderer.camera = camera;
    }
    dispose(): void {
      renderer.disposed++;
    }
  }
  return { ...actual, WebGLRenderer: StubRenderer };
});

const PAGE = '<header id="header"></header><canvas id="scene"></canvas><nav id="info-panel"></nav>';
const device = () => (window as unknown as HappyWindow).happyDOM.settings.device;

/** Run `frames` loop iterations at 60 Hz and return the node positions after them. */
function runFrames(frames: number): number[] {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const nodePositions = () => {
    const out: number[] = [];
    renderer.scene?.traverse(o => {
      if (o.userData['nodeId']) out.push(...o.getWorldPosition(o.position.clone()).toArray());
    });
    return out;
  };
  for (let i = 0; i < frames; i++) {
    now += 1000 / 60;
    renderer.loop?.(now);
  }
  const positions = nodePositions();
  vi.mocked(performance.now).mockRestore();
  return positions;
}

/**
 * A client point on ring `id`'s pick tube, clear of every node, as the
 * app's camera shows the scene in a `width` x `height` window before its
 * rings turn: the tube depends only on the ring's tilt.
 */
function ringPoint(id: string, width: number, height: number): { x: number; y: number } {
  const preset = cameraPresetFor(width);
  const camera = new THREE.PerspectiveCamera(preset.fov, width / height, 0.1, 100);
  camera.position.set(...preset.position);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const ring = new OrbitalRing(ORBITALS.find(o => o.id === id)!);
  ring.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (let k = 0; k < 64; k++) {
    const t = (k / 64) * Math.PI * 2;
    const world = ring.group.localToWorld(new THREE.Vector3(Math.cos(t) * ring.config.radiusX, 0, Math.sin(t) * ring.config.radiusY));
    const ndc = world.project(camera);
    ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    // Nodes sit at the ring's centre until the first frame places them.
    if (ray.intersectObject(ring.hitMesh, false).length > 0 && Math.hypot(ndc.x, ndc.y) > 0.2) {
      return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height };
    }
  }
  throw new Error(`no point on ring ${id}`);
}

describe('App', () => {
  let app: App;

  beforeEach(() => {
    renderer.fail = false;
    renderer.loop = null;
    renderer.scene = null;
    renderer.camera = null;
    renderer.loopCalls = [];
    renderer.disposed = 0;
    document.body.innerHTML = PAGE;
  });
  afterEach(() => {
    app.dispose();
    device().prefersReducedMotion = 'no-preference';
    document.body.innerHTML = '';
  });

  it('builds the header and one panel category per section', () => {
    app = new App();
    expect(document.querySelector('.header-name')?.textContent).toBe('Phillip Demarest, PhD');
    const ids = [...document.querySelectorAll<HTMLElement>('.ip-category')].map(c => c.dataset['ringId']);
    expect(ids).toEqual(SECTIONS.map(s => s.id));
  });

  it('routes panel clicks and scene hovers through its store', () => {
    app = new App();
    document.querySelector<HTMLElement>('.ip-category[data-ring-id="projects"] .ip-category-name')!.click();
    expect(app.store.getState().selectedRingId).toBe('projects');

    app.store.hoverNode('papers', 'scene');
    expect(document.querySelector('.ip-node.scene-hovered')?.getAttribute('data-node-id')).toBe('papers');

    // Clicks on the running scene's canvas are the scene's to report.
    document.getElementById('scene')!.click();
    expect(app.store.getState().selectedRingId).toBe('projects');
  });

  it('gives the scene its hover back when the ring under a still pointer is deselected', () => {
    app = new App();
    app.start();
    // One frame, with the world matrices three.js's renderer would update.
    renderer.loop?.(performance.now());
    renderer.scene!.updateMatrixWorld(true);
    renderer.camera!.updateMatrixWorld();
    const canvas = document.getElementById('scene') as HTMLCanvasElement;
    const { innerWidth: w, innerHeight: h } = window;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, x: 0, y: 0, width: w, height: h, right: w, bottom: h } as DOMRect);
    const p = ringPoint('projects', w, h);
    const fire = (type: string, buttons = 0) =>
      canvas.dispatchEvent(
        new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons }),
      );
    const click = () => {
      fire('pointerdown', 1);
      fire('pointerup');
    };
    const hoveredByScene = { id: 'projects', source: 'scene' };

    fire('pointermove');
    expect(app.store.getState().hoveredRing).toEqual(hoveredByScene);
    click(); // selects projects: the selected ring is never hovered
    expect(app.store.getState()).toMatchObject({ selectedRingId: 'projects', hoveredRing: null });
    click(); // deselects it, the pointer still on the ring
    expect(app.store.getState()).toMatchObject({ selectedRingId: null, hoveredRing: hoveredByScene });
    const category = document.querySelector('.ip-category[data-ring-id="projects"] .ip-category-name')!;
    expect(category.getAttribute('aria-expanded')).toBe('true');

    click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(app.store.getState()).toMatchObject({ selectedRingId: null, hoveredRing: hoveredByScene });
  });

  it('dispose() stops the render loop, releases the renderer and the node geometry, and disconnects the panel', () => {
    app = new App();
    app.start();
    expect(renderer.loop).not.toBeNull();
    // A node made now shares the app's node geometry.
    const nodeGeometry = vi.spyOn(new OrbitalNode(ORBITALS[0]!.nodes[0]!).mesh.geometry, 'dispose');
    app.dispose();
    expect(renderer.loopCalls[renderer.loopCalls.length - 1]).toBeNull();
    expect(renderer.disposed).toBe(1);
    expect(nodeGeometry).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.ip-category')).toHaveLength(0);
    app.store.toggleSelection('projects');
    document.body.click();
    expect(app.store.getState().selectedRingId).toBe('projects');
  });

  it('without WebGL, keeps the header and the panel working and shows a notice', () => {
    renderer.fail = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    app = new App();
    app.start();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.scene-notice')?.textContent).toBe('The 3D view could not start in this browser.');
    expect(document.querySelector('.header-name')).not.toBeNull();
    document.querySelector<HTMLElement>('.ip-category[data-ring-id="experiences"] .ip-category-name')!.click();
    expect(app.store.getState().selectedRingId).toBe('experiences');
    // With no scene, the canvas is page background: a click on it is a click outside.
    document.getElementById('scene')!.click();
    expect(app.store.getState().selectedRingId).toBeNull();
    app.dispose();
    expect(document.querySelector('.scene-notice')).toBeNull();
  });

  it('moves the scene by default and holds it still under prefers-reduced-motion', () => {
    app = new App();
    app.start();
    const first = runFrames(1);
    expect(runFrames(30)).not.toEqual(first);
    app.dispose();

    device().prefersReducedMotion = 'reduce';
    document.body.innerHTML = PAGE;
    app = new App();
    app.start();
    const still = runFrames(1);
    expect(runFrames(30)).toEqual(still);

    // Selecting a section lays its ring flat at once, then nothing moves.
    document.querySelector<HTMLElement>('.ip-category[data-ring-id="projects"] .ip-category-name')!.click();
    const flat = runFrames(1);
    expect(flat).not.toEqual(still);
    expect(runFrames(30)).toEqual(flat);
  });
});

// @vitest-environment happy-dom
import * as THREE from 'three';
import type * as ThreeModule from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneManager } from '../../../src/scene/SceneManager';
import { setViewport } from './viewport';

// Gap found by mutation testing (2026-11-07): nothing pinned SceneManager's
// mobile breakpoint, the camera presets or the camera update on resize. The
// browser suite runs at 375 px and 1280 px only, far from the 768 px edge,
// and never resizes. happy-dom has no WebGL, so the renderer is stubbed.

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof ThreeModule>();
  class StubRenderer {
    setPixelRatio(): void {}
    setSize(): void {}
    setAnimationLoop(): void {}
    render(): void {}
  }
  return { ...actual, WebGLRenderer: StubRenderer };
});

const MOBILE = { fov: 65, position: [0, 7, 14] };
const DESKTOP = { fov: 45, position: [0, 5.5, 8] };

function expectCamera(sm: SceneManager, preset: typeof MOBILE, width: number, height: number): void {
  const cam = sm.camera;
  expect(cam.fov).toBe(preset.fov);
  expect(cam.position.toArray()).toEqual(preset.position);
  expect(cam.aspect).toBeCloseTo(width / height, 12);
  // Looking at the origin.
  const dir = cam.getWorldDirection(new THREE.Vector3());
  const toOrigin = cam.position.clone().negate().normalize();
  expect(dir.distanceTo(toOrigin)).toBeLessThan(1e-9);
}

describe('SceneManager camera gaps', () => {
  afterEach(() => {
    setViewport(1024, 768);
  });

  it('uses the mobile camera below 768 px and the desktop camera from 768 px', () => {
    setViewport(767, 900);
    expectCamera(new SceneManager(document.createElement('canvas')), MOBILE, 767, 900);
    setViewport(768, 900);
    expectCamera(new SceneManager(document.createElement('canvas')), DESKTOP, 768, 900);
  });

  it('switches camera preset and aspect on window resize', () => {
    setViewport(1280, 800);
    const sm = new SceneManager(document.createElement('canvas'));
    expectCamera(sm, DESKTOP, 1280, 800);
    setViewport(375, 812); // happy-dom dispatches 'resize'
    expectCamera(sm, MOBILE, 375, 812);
    setViewport(1280, 800);
    expectCamera(sm, DESKTOP, 1280, 800);
  });
});

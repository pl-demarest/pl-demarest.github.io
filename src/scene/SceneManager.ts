import * as THREE from 'three';
import { isMobileWidth } from '../ui/breakpoints';

export interface CameraPreset {
  readonly fov: number;
  readonly position: readonly [number, number, number];
}

/** The camera for viewports wider than the mobile breakpoint. */
export const DESKTOP_CAMERA: CameraPreset = { fov: 45, position: [0, 5.5, 8] };
/** The camera for mobile viewports: wider and further back, so every ring fits. */
export const MOBILE_CAMERA: CameraPreset = { fov: 65, position: [0, 7, 14] };

export function cameraPresetFor(width: number): CameraPreset {
  return isMobileWidth(width) ? MOBILE_CAMERA : DESKTOP_CAMERA;
}

/** Longest step passed to tick callbacks, in seconds, so a stalled tab does not jump. */
const MAX_DT = 0.05;

/** Device pixels per CSS pixel for the drawing buffer, at most 2. */
function pixelRatio(): number {
  return Math.min(window.devicePixelRatio, 2);
}

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private animationCallbacks: Array<(dt: number) => void> = [];
  private lastTime = 0;
  private readonly listeners = new AbortController();

  /** Throws if the browser cannot create a WebGL context. */
  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(DESKTOP_CAMERA.fov, aspect, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(pixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.updateCameraForViewport(window.innerWidth, window.innerHeight);

    window.addEventListener('resize', this.onResize, { signal: this.listeners.signal });
    this.watchPixelRatio();
  }

  /**
   * A browser zoom changes the pixel ratio with a resize; a move to a
   * display with another scale changes it without one. A resolution query
   * on the current ratio reports that change, then watches the new ratio.
   */
  private watchPixelRatio(): void {
    window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        this.onResize();
        this.watchPixelRatio();
      },
      { once: true, signal: this.listeners.signal },
    );
  }

  private updateCameraForViewport(w: number, h: number): void {
    const preset = cameraPresetFor(w);
    this.camera.position.set(...preset.position);
    this.camera.fov = preset.fov;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);
  }

  onTick(callback: (dt: number) => void): void {
    this.animationCallbacks.push(callback);
  }

  start(): void {
    this.lastTime = performance.now();
    this.renderer.setAnimationLoop(() => {
      const now = performance.now();
      const dt = Math.min((now - this.lastTime) / 1000, MAX_DT);
      this.lastTime = now;
      for (const cb of this.animationCallbacks) cb(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }

  /** Stop the loop, stop listening and release the renderer. Scene objects are disposed by their owners. */
  dispose(): void {
    this.stop();
    this.listeners.abort();
    this.animationCallbacks = [];
    this.renderer.dispose();
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.updateCameraForViewport(w, h);
    this.renderer.setPixelRatio(pixelRatio());
    this.renderer.setSize(w, h);
  };
}

import * as THREE from 'three';

const DESKTOP_FOV = 45;
const DESKTOP_CAM = new THREE.Vector3(0, 5.5, 8);
const MOBILE_FOV  = 65;
const MOBILE_CAM  = new THREE.Vector3(0, 7, 14);
const MOBILE_BREAKPOINT = 768;

export class SceneManager {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private animationCallbacks: Array<(dt: number) => void> = [];
  private lastTime = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffffff);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(DESKTOP_FOV, aspect, 0.1, 100);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.updateCameraForViewport(window.innerWidth, window.innerHeight);

    window.addEventListener('resize', this.onResize);
  }

  private updateCameraForViewport(w: number, h: number): void {
    const isMobile = w < MOBILE_BREAKPOINT;
    this.camera.position.copy(isMobile ? MOBILE_CAM : DESKTOP_CAM);
    this.camera.fov = isMobile ? MOBILE_FOV : DESKTOP_FOV;
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
      const dt = Math.min((now - this.lastTime) / 1000, 0.05);
      this.lastTime = now;
      for (const cb of this.animationCallbacks) cb(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.updateCameraForViewport(w, h);
    this.renderer.setSize(w, h);
  };
}

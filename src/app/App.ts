import { SECTIONS } from '../content/site';
import type { SiteNode } from '../content/types';
import { InteractionManager } from '../scene/InteractionManager';
import { disposeNodeGeometry } from '../scene/OrbitalNode';
import { OrbitalRing } from '../scene/OrbitalRing';
import { ParticleField } from '../scene/ParticleField';
import { SceneManager } from '../scene/SceneManager';
import { ORBITALS } from '../scene/config';
import { InfoPanel } from '../ui/InfoPanel';
import { initHeader } from '../ui/header';
import { bindScene } from './sceneBinding';
import { Store } from './store';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Composition root. The header and the panel come up first and work on
 * their own; the WebGL scene is added when the browser can create it. Scene
 * and panel are connected only through one Store: the scene reports pointer
 * hover and clicks into it, and the panel and the scene binding render from
 * it.
 */
export class App {
  readonly store = new Store();
  private readonly listeners = new AbortController();
  private readonly disposers: Array<() => void> = [];
  private sceneManager: SceneManager | null = null;

  constructor() {
    initHeader();

    const canvas = document.getElementById('scene');
    const sceneElement = canvas instanceof HTMLCanvasElement ? canvas : null;

    const panelRoot = document.getElementById('info-panel');
    if (panelRoot) {
      const panel = new InfoPanel(panelRoot, SECTIONS, this.store, {
        sceneElement,
        onNodeActivate: node => this.activateNode(node),
      });
      this.disposers.push(() => panel.dispose());
    }

    if (sceneElement) this.createScene(sceneElement);
  }

  start(): void {
    this.sceneManager?.start();
  }

  /** Stop the scene and release everything the app created. */
  dispose(): void {
    this.listeners.abort();
    for (const dispose of this.disposers.splice(0).reverse()) dispose();
    this.sceneManager = null;
  }

  private createScene(canvas: HTMLCanvasElement): void {
    let sm: SceneManager;
    try {
      sm = new SceneManager(canvas);
    } catch (error) {
      console.warn('The 3D scene could not start; the panel still works.', error);
      this.showSceneNotice();
      return;
    }

    // Object creation order is part of the browser suite's contract: three.js
    // draws UUIDs from Math.random, which the suite seeds, so creating
    // objects in another order moves the particle layout.
    const rings = ORBITALS.map(cfg => {
      const ring = new OrbitalRing(cfg);
      sm.scene.add(ring.group);
      return ring;
    });

    const particles = new ParticleField();
    sm.scene.add(particles.backgroundGroup);
    sm.scene.add(particles.foregroundGroup);

    const interaction = new InteractionManager(sm.camera, canvas, {
      onHover: target => {
        this.store.hoverNode(target?.node?.config.id ?? null, 'scene');
        this.store.hoverRing(target?.ring.config.id ?? null, 'scene');
      },
      onRingClick: ring => this.store.toggleSelection(ring.config.id),
      onNodeClick: node => this.activateNode(node.config),
      onBackgroundClick: () => this.store.clearSelection(),
    });
    interaction.setRings(rings);
    const unbind = bindScene(this.store, rings);

    sm.onTick(dt => {
      for (const ring of rings) ring.update(dt);
      particles.update(dt);
    });

    // Reduced motion pauses the rings' own rotation and the particle drift.
    const motion = window.matchMedia(REDUCED_MOTION_QUERY);
    const applyMotion = (): void => {
      for (const ring of rings) ring.setAutoRotate(!motion.matches);
      particles.setDrifting(!motion.matches);
    };
    applyMotion();
    motion.addEventListener('change', applyMotion, { signal: this.listeners.signal });

    this.disposers.push(() => {
      unbind();
      interaction.dispose();
      for (const ring of rings) ring.dispose();
      disposeNodeGeometry();
      particles.dispose();
      sm.dispose();
    });
    this.sceneManager = sm;
  }

  private showSceneNotice(): void {
    const notice = document.createElement('p');
    notice.className = 'scene-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = 'The 3D view could not start in this browser.';
    document.body.appendChild(notice);
    this.disposers.push(() => notice.remove());
  }

  /** Carry out a node's action. Every node is { kind: 'none' } until Phase 2 adds targets. */
  private activateNode(node: SiteNode): void {
    if (node.action.kind === 'none') return;
    console.warn(`node "${node.id}": "${node.action.kind}" actions are not implemented yet`);
  }
}

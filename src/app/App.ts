import { SECTIONS } from '../content/site';
import type { SiteNode } from '../content/types';
import { InteractionManager } from '../scene/InteractionManager';
import { OrbitalRing } from '../scene/OrbitalRing';
import { ParticleField } from '../scene/ParticleField';
import { SceneManager } from '../scene/SceneManager';
import { ORBITALS } from '../scene/config';
import { InfoPanel } from '../ui/InfoPanel';
import { initHeader } from '../ui/header';
import { bindScene } from './sceneBinding';
import { Store } from './store';

/**
 * Composition root: builds the scene and the UI and connects them through
 * one Store. The scene reports pointer hover and clicks into the store; the
 * panel and the scene binding render from it.
 */
export class App {
  readonly store = new Store();
  private readonly sceneManager: SceneManager;
  private readonly teardowns: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    // Object creation order is part of the browser suite's contract: three.js
    // draws UUIDs from Math.random, which the suite seeds, so creating
    // objects in another order moves the particle layout.
    const sm = new SceneManager(canvas);

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
    this.teardowns.push(bindScene(this.store, rings));

    sm.onTick(dt => {
      for (const ring of rings) ring.update(dt);
      particles.update(dt);
    });

    initHeader();
    const panelRoot = document.getElementById('info-panel');
    if (panelRoot) {
      const panel = new InfoPanel(panelRoot, SECTIONS, this.store, {
        sceneElement: canvas,
        onNodeActivate: node => this.activateNode(node),
      });
      this.teardowns.push(() => panel.dispose());
    }
    this.sceneManager = sm;
  }

  start(): void {
    this.sceneManager.start();
  }

  /** Disconnect the store bindings and the panel. */
  dispose(): void {
    for (const teardown of this.teardowns.splice(0).reverse()) teardown();
  }

  /** Carry out a node's action. Every node is { kind: 'none' } until Phase 2 adds targets. */
  private activateNode(node: SiteNode): void {
    if (node.action.kind === 'none') return;
    console.warn(`node "${node.id}": "${node.action.kind}" actions are not implemented yet`);
  }
}

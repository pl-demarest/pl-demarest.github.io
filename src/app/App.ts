import { SECTIONS } from '../content/site';
import { InteractionManager } from '../scene/InteractionManager';
import { OrbitalRing } from '../scene/OrbitalRing';
import { ParticleField } from '../scene/ParticleField';
import { SceneManager } from '../scene/SceneManager';
import { ORBITALS } from '../scene/config';
import { initHeader } from '../ui/header';
import { initInfoPanel, selectRingFromScene } from '../ui/info-panel';
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

    const interaction = new InteractionManager(sm.camera, canvas);
    interaction.setRings(rings);
    interaction.setRingHoverCallback(ring => this.store.hoverRing(ring?.config.id ?? null, 'scene'));
    interaction.setRingClickCallback(ring => selectRingFromScene(ring.config.id));
    interaction.setHoverCallback(node => this.store.hoverNode(node?.config.id ?? null, 'scene'));
    this.teardowns.push(bindScene(this.store, rings));

    sm.onTick(dt => {
      for (const ring of rings) ring.update(dt);
      particles.update(dt);
    });

    initHeader();
    this.teardowns.push(initInfoPanel(SECTIONS, this.store));
    this.sceneManager = sm;
  }

  start(): void {
    this.sceneManager.start();
  }

  /** Disconnect the store bindings and the panel. */
  dispose(): void {
    for (const teardown of this.teardowns.splice(0).reverse()) teardown();
  }
}

import { SceneManager } from './scene/SceneManager';
import { OrbitalRing } from './scene/OrbitalRing';
import { ParticleField } from './scene/ParticleField';
import { InteractionManager } from './scene/InteractionManager';
import { ORBITALS } from './scene/config';
import { initHeader } from './ui/header';
import { initInfoPanel, setSceneHover, selectRingFromScene, highlightSceneNode } from './ui/info-panel';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
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
interaction.setRingHoverCallback((ring) => setSceneHover(ring));
interaction.setRingClickCallback((ring) => selectRingFromScene(ring));
interaction.setHoverCallback((node) => highlightSceneNode(node?.config.id ?? null));

sm.onTick(dt => {
  for (const ring of rings) ring.update(dt);
  particles.update(dt);
});

initHeader();
initInfoPanel(rings);
sm.start();

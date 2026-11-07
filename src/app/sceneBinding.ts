import type { OrbitalRing } from '../scene/OrbitalRing';
import type { Store, Unsubscribe } from './store';

/**
 * Render the store onto the scene: the selected ring lies flat with its
 * nodes highlighted, and the hovered node is highlighted whichever side
 * hovered it. Returns a function that stops rendering.
 */
export function bindScene(store: Store, rings: readonly OrbitalRing[]): Unsubscribe {
  const ringById = new Map(rings.map(ring => [ring.config.id, ring]));
  const nodeById = new Map(rings.flatMap(ring => ring.nodes.map(node => [node.config.id, node] as const)));

  const showSelected = (ringId: string | null, selected: boolean): void => {
    const ring = ringId === null ? undefined : ringById.get(ringId);
    if (!ring) return;
    ring.setFlatView(selected);
    for (const node of ring.nodes) node.setSelected(selected);
  };
  const showHovered = (nodeId: string | null, hovered: boolean): void => {
    if (nodeId !== null) nodeById.get(nodeId)?.setHovered(hovered);
  };

  const unsubscribers = [
    store.subscribe(
      s => s.selectedRingId,
      (id, previous) => {
        showSelected(previous, false);
        showSelected(id, true);
      },
    ),
    store.subscribe(
      s => s.hoveredNode?.id ?? null,
      (id, previous) => {
        showHovered(previous, false);
        showHovered(id, true);
      },
    ),
  ];
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

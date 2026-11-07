import type { AppState, Store } from '../app/store';
import type { Section } from '../content/types';

// Hover and selection live in the store. This module keeps only its DOM
// references and the outside-click flag.
let panelEl: HTMLElement | null = null;
let store: Store | null = null;

/** Section id -> .ip-category and its .ip-category-name, in section order. */
const categoryEls = new Map<string, HTMLElement>();
const nameEls = new Map<string, HTMLElement>();
/** Node id -> .ip-node. */
const nodeEls = new Map<string, HTMLElement>();

const PANEL_INFLATE_LEFT = 60;
const PANEL_INFLATE_V = 12;
const NAME_INFLATE_LEFT = 40;
const NAME_INFLATE_V = 6;

/** Build the panel from the sections and connect it to the store. Returns a teardown. */
export function initInfoPanel(sections: readonly Section[], appStore: Store): () => void {
  panelEl = document.getElementById('info-panel');
  if (!panelEl) return () => {};
  store = appStore;

  for (const section of sections) {
    const category = document.createElement('div');
    category.className = 'ip-category';
    category.dataset['ringId'] = section.id;

    const nameEl = document.createElement('div');
    nameEl.className = 'ip-category-name';
    nameEl.textContent = section.label;
    category.appendChild(nameEl);

    const nodesContainer = document.createElement('div');
    nodesContainer.className = 'ip-nodes';

    for (const node of section.nodes) {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'ip-node';
      nodeEl.dataset['nodeId'] = node.id;
      nodeEl.textContent = node.label;

      nodeEl.addEventListener('pointerenter', () => {
        appStore.hoverNode(node.id, 'panel');
      });
      nodeEl.addEventListener('pointerleave', () => {
        appStore.hoverNode(null, 'panel');
      });

      nodesContainer.appendChild(nodeEl);
      nodeEls.set(node.id, nodeEl);
    }

    category.appendChild(nodesContainer);

    nameEl.addEventListener('click', () => {
      appStore.toggleSelection(section.id);
    });

    categoryEls.set(section.id, category);
    nameEls.set(section.id, nameEl);
    panelEl.appendChild(category);
  }

  const unsubscribers = [
    appStore.subscribe(s => s.hoveredRing?.id ?? null, (id, previous) => toggleClass(categoryEls, previous, id, 'hovered')),
    appStore.subscribe(s => s.selectedRingId, (id, previous) => toggleClass(categoryEls, previous, id, 'selected')),
    appStore.subscribe(sceneHoveredNodeId, (id, previous) => toggleClass(nodeEls, previous, id, 'scene-hovered')),
  ];

  document.addEventListener('pointermove', onDocumentPointerMove, { passive: true });
  document.addEventListener('click', onDocumentClick);

  return () => {
    document.removeEventListener('pointermove', onDocumentPointerMove);
    document.removeEventListener('click', onDocumentClick);
    for (const unsubscribe of unsubscribers) unsubscribe();
    for (const category of categoryEls.values()) category.remove();
    categoryEls.clear();
    nameEls.clear();
    nodeEls.clear();
    suppressNextOutsideClick = false;
    panelEl = null;
    store = null;
  };
}

/** Panel rows mark only scene hovers; a hovered row shows its own :hover style. */
function sceneHoveredNodeId(state: AppState): string | null {
  return state.hoveredNode?.source === 'scene' ? state.hoveredNode.id : null;
}

function toggleClass(
  elements: ReadonlyMap<string, HTMLElement>,
  previous: string | null,
  next: string | null,
  className: string,
): void {
  if (previous !== null) elements.get(previous)?.classList.remove(className);
  if (next !== null) elements.get(next)?.classList.add(className);
}

function isInsideInflatedPanel(x: number, y: number): boolean {
  if (!panelEl) return false;
  const r = panelEl.getBoundingClientRect();
  const topInflate = window.innerWidth < 768 ? 48 : PANEL_INFLATE_V;
  return (
    x >= r.left - PANEL_INFLATE_LEFT &&
    x <= r.right &&
    y >= r.top - topInflate &&
    y <= r.bottom + PANEL_INFLATE_V
  );
}

/** The unselected section whose inflated name rect contains the point. */
function findNameHit(x: number, y: number, selectedId: string | null): string | null {
  for (const [id, nameEl] of nameEls) {
    if (id === selectedId) continue;
    const r = nameEl.getBoundingClientRect();
    if (
      x >= r.left - NAME_INFLATE_LEFT &&
      x <= r.right + 4 &&
      y >= r.top - NAME_INFLATE_V &&
      y <= r.bottom + NAME_INFLATE_V
    ) {
      return id;
    }
  }
  return null;
}

/** The unselected section whose name is nearest the point: along y on desktop, x on mobile. */
function findNearestName(x: number, y: number, selectedId: string | null): string | null {
  const isMobile = window.innerWidth < 768;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, nameEl] of nameEls) {
    if (id === selectedId) continue;
    const r = nameEl.getBoundingClientRect();
    const center = isMobile ? r.left + r.width / 2 : r.top + r.height / 2;
    const pointer = isMobile ? x : y;
    const dist = Math.abs(pointer - center);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  }
  return best;
}

function onDocumentPointerMove(e: PointerEvent): void {
  if (!store) return;
  const x = e.clientX;
  const y = e.clientY;

  if (!isInsideInflatedPanel(x, y)) {
    store.hoverRing(null, 'panel');
    return;
  }

  const { hoveredRing, selectedRingId } = store.getState();
  if (hoveredRing) {
    const hit = findNameHit(x, y, selectedRingId);
    if (hit !== null && hit !== hoveredRing.id) store.hoverRing(hit, 'panel');
    return;
  }

  const nearest = findNearestName(x, y, selectedRingId);
  if (nearest !== null) store.hoverRing(nearest, 'panel');
}

let suppressNextOutsideClick = false;

function onDocumentClick(e: MouseEvent): void {
  if (suppressNextOutsideClick) {
    suppressNextOutsideClick = false;
    return;
  }
  if (!store || !panelEl) return;
  if (store.getState().selectedRingId === null) return;
  if (panelEl.contains(e.target as Node)) return;
  store.clearSelection();
}

/**
 * Toggle a ring's selection for a click in the scene. The browser follows the
 * canvas pointerup with a document click, which must not clear the new
 * selection, so the next outside click is ignored.
 */
export function selectRingFromScene(ringId: string): void {
  if (!store || !categoryEls.has(ringId)) return;
  suppressNextOutsideClick = true;
  store.toggleSelection(ringId);
}

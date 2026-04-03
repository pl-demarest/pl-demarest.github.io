import type { OrbitalRing } from '../scene/OrbitalRing';

let panelEl: HTMLElement | null = null;
let selectedRing: OrbitalRing | null = null;
let hoveredCategory: HTMLElement | null = null;
let hoveredRing: OrbitalRing | null = null;
let hoverSource: 'panel' | 'scene' | null = null;

const categoryMap = new Map<HTMLElement, OrbitalRing>();
const ringToCategory = new Map<OrbitalRing, HTMLElement>();

const PANEL_INFLATE_LEFT = 60;
const PANEL_INFLATE_V = 12;
const NAME_INFLATE_LEFT = 40;
const NAME_INFLATE_V = 6;

export function initInfoPanel(orbitalRings: OrbitalRing[]): void {
  panelEl = document.getElementById('info-panel');
  if (!panelEl) return;

  for (const ring of orbitalRings) {
    const category = document.createElement('div');
    category.className = 'ip-category';
    category.dataset['ringId'] = ring.config.id;

    const nameEl = document.createElement('div');
    nameEl.className = 'ip-category-name';
    nameEl.textContent = ring.config.label;
    category.appendChild(nameEl);

    const nodesContainer = document.createElement('div');
    nodesContainer.className = 'ip-nodes';

    for (const node of ring.nodes) {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'ip-node';
      nodeEl.dataset['nodeId'] = node.config.id;
      nodeEl.textContent = node.config.label;

      nodeEl.addEventListener('mouseenter', () => {
        node.setHovered(true);
      });
      nodeEl.addEventListener('mouseleave', () => {
        node.setHovered(false);
      });

      nodesContainer.appendChild(nodeEl);
    }

    category.appendChild(nodesContainer);

    nameEl.addEventListener('click', () => {
      handleCategoryClick(ring, category, panelEl!);
    });

    categoryMap.set(category, ring);
    ringToCategory.set(ring, category);
    panelEl.appendChild(category);
  }

  document.addEventListener('pointermove', onDocumentPointerMove, { passive: true });
  document.addEventListener('click', onDocumentClick);
}

function clearHoverExpansion(): void {
  if (!hoveredCategory) return;
  hoveredCategory.classList.remove('hovered');
  hoveredRing?.setHighlighted(false);
  hoveredCategory = null;
  hoveredRing = null;
  hoverSource = null;
}

function isInsideInflatedPanel(x: number, y: number): boolean {
  if (!panelEl) return false;
  const r = panelEl.getBoundingClientRect();
  return (
    x >= r.left - PANEL_INFLATE_LEFT &&
    x <= r.right &&
    y >= r.top - PANEL_INFLATE_V &&
    y <= r.bottom + PANEL_INFLATE_V
  );
}

function findNameHit(x: number, y: number): { el: HTMLElement; ring: OrbitalRing } | null {
  for (const [el, ring] of categoryMap) {
    if (selectedRing === ring) continue;
    const nameEl = el.querySelector('.ip-category-name');
    if (!nameEl) continue;
    const r = nameEl.getBoundingClientRect();
    if (
      x >= r.left - NAME_INFLATE_LEFT &&
      x <= r.right + 4 &&
      y >= r.top - NAME_INFLATE_V &&
      y <= r.bottom + NAME_INFLATE_V
    ) {
      return { el, ring };
    }
  }
  return null;
}

function findNearestName(y: number): { el: HTMLElement; ring: OrbitalRing } | null {
  let best: { el: HTMLElement; ring: OrbitalRing } | null = null;
  let bestDist = Infinity;
  for (const [el, ring] of categoryMap) {
    if (selectedRing === ring) continue;
    const nameEl = el.querySelector('.ip-category-name');
    if (!nameEl) continue;
    const r = nameEl.getBoundingClientRect();
    const centerY = r.top + r.height / 2;
    const dist = Math.abs(y - centerY);
    if (dist < bestDist) {
      bestDist = dist;
      best = { el, ring };
    }
  }
  return best;
}

function setHover(el: HTMLElement, ring: OrbitalRing, source: 'panel' | 'scene'): void {
  if (hoveredCategory === el) return;
  clearHoverExpansion();
  hoveredCategory = el;
  hoveredRing = ring;
  hoverSource = source;
  el.classList.add('hovered');
  ring.setHighlighted(true);
}

function onDocumentPointerMove(e: PointerEvent): void {
  const x = e.clientX;
  const y = e.clientY;

  if (!isInsideInflatedPanel(x, y)) {
    if (hoverSource !== 'scene') {
      clearHoverExpansion();
    }
    return;
  }

  if (hoveredCategory) {
    const hit = findNameHit(x, y);
    if (hit && hit.el !== hoveredCategory) {
      setHover(hit.el, hit.ring, 'panel');
    }
    return;
  }

  const nearest = findNearestName(y);
  if (nearest) {
    setHover(nearest.el, nearest.ring, 'panel');
  }
}

let suppressNextOutsideClick = false;

function onDocumentClick(e: MouseEvent): void {
  if (suppressNextOutsideClick) {
    suppressNextOutsideClick = false;
    return;
  }
  if (!selectedRing || !panelEl) return;
  if (panelEl.contains(e.target as Node)) return;
  clearSelection();
}

function clearSelection(): void {
  if (!selectedRing || !panelEl) return;
  const prevEl = panelEl.querySelector('.ip-category.selected');
  prevEl?.classList.remove('selected', 'hovered');
  selectedRing.setFlatView(false);
  selectedRing.setHighlighted(false);
  for (const node of selectedRing.nodes) {
    node.setSelected(false);
  }
  selectedRing = null;
}

let sceneHoveredNodeEl: HTMLElement | null = null;

export function highlightSceneNode(nodeId: string | null): void {
  if (sceneHoveredNodeEl) {
    sceneHoveredNodeEl.classList.remove('scene-hovered');
    sceneHoveredNodeEl = null;
  }
  if (nodeId && panelEl) {
    const el = panelEl.querySelector(`.ip-node[data-node-id="${nodeId}"]`) as HTMLElement | null;
    if (el) {
      el.classList.add('scene-hovered');
      sceneHoveredNodeEl = el;
    }
  }
}

export function setSceneHover(ring: OrbitalRing | null): void {
  if (ring) {
    const el = ringToCategory.get(ring);
    if (el && selectedRing !== ring) {
      setHover(el, ring, 'scene');
    }
  } else {
    if (hoverSource === 'scene') {
      clearHoverExpansion();
    }
  }
}

export function selectRingFromScene(ring: OrbitalRing): void {
  if (!panelEl) return;
  const el = ringToCategory.get(ring);
  if (!el) return;
  suppressNextOutsideClick = true;
  handleCategoryClick(ring, el, panelEl);
}

function handleCategoryClick(
  ring: OrbitalRing,
  categoryEl: HTMLElement,
  panel: HTMLElement,
): void {
  const wasSelected = selectedRing === ring;

  if (selectedRing) {
    const prevEl = panel.querySelector('.ip-category.selected');
    prevEl?.classList.remove('selected', 'hovered');
    selectedRing.setFlatView(false);
    selectedRing.setHighlighted(false);

    for (const node of selectedRing.nodes) {
      node.setSelected(false);
    }
  }

  if (wasSelected) {
    selectedRing = null;
    return;
  }

  selectedRing = ring;
  categoryEl.classList.remove('hovered');
  categoryEl.classList.add('selected');
  ring.setFlatView(true);
  ring.setHighlighted(true);

  for (const node of ring.nodes) {
    node.setSelected(true);
  }

  if (hoveredCategory === categoryEl) {
    hoveredCategory = null;
    hoveredRing = null;
  }
}

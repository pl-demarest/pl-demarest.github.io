import type { AppState, Store, Unsubscribe } from '../app/store';
import type { Section } from '../content/types';

// Hover zones around the panel and around each category name, in CSS px.
const PANEL_INFLATE_LEFT = 60;
const PANEL_INFLATE_V = 12;
const PANEL_INFLATE_TOP_MOBILE = 48;
const NAME_INFLATE_LEFT = 40;
const NAME_INFLATE_RIGHT = 4;
const NAME_INFLATE_V = 6;
const MOBILE_BREAKPOINT = 768;

export interface InfoPanelOptions {
  /**
   * The scene's element. A click on it belongs to the scene, which reports
   * ring clicks and background clicks to the store itself, so the panel
   * does not treat it as a click outside.
   */
  sceneElement?: Element | null;
}

interface Category {
  readonly id: string;
  readonly root: HTMLElement;
  readonly name: HTMLElement;
}

interface Layout {
  readonly panel: DOMRect;
  /** Category name rects by section id, in panel order. */
  readonly names: ReadonlyMap<string, DOMRect>;
}

/**
 * The section list beside the scene. Pointer proximity hovers a category, a
 * click selects it, and a click outside the panel and the scene clears the
 * selection. All of it goes through the store, and the panel renders its
 * classes from the store.
 */
export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly store: Store;
  private readonly sceneElement: Element | null;
  private readonly categories: Category[] = [];
  private readonly nodeElements = new Map<string, HTMLElement>();
  private readonly listeners = new AbortController();
  private readonly unsubscribe: Unsubscribe;
  /** Cached rects; null until measured and after anything that moves them. */
  private layout: Layout | null = null;
  /** CSS transitions running inside the panel; rects are read live while any run. */
  private runningTransitions = 0;

  constructor(root: HTMLElement, sections: readonly Section[], store: Store, options: InfoPanelOptions = {}) {
    this.root = root;
    this.store = store;
    this.sceneElement = options.sceneElement ?? null;

    const { signal } = this.listeners;
    for (const section of sections) this.categories.push(this.buildCategory(section, signal));

    document.addEventListener('pointermove', this.onDocumentPointerMove, { passive: true, signal });
    document.addEventListener('click', this.onDocumentClick, { signal });
    window.addEventListener('resize', this.invalidateLayout, { signal });
    window.addEventListener('scroll', this.invalidateLayout, { capture: true, passive: true, signal });
    root.addEventListener('transitionrun', this.onTransitionRun, { signal });
    root.addEventListener('transitionend', this.onTransitionDone, { signal });
    root.addEventListener('transitioncancel', this.onTransitionDone, { signal });

    this.unsubscribe = store.subscribe(
      state => state,
      state => {
        this.render(state);
        this.invalidateLayout();
      },
    );
    this.render(store.getState());
  }

  dispose(): void {
    this.listeners.abort();
    this.unsubscribe();
    for (const category of this.categories) category.root.remove();
    this.categories.length = 0;
    this.nodeElements.clear();
    this.layout = null;
  }

  private buildCategory(section: Section, signal: AbortSignal): Category {
    const root = document.createElement('div');
    root.className = 'ip-category';
    root.dataset['ringId'] = section.id;

    const name = document.createElement('div');
    name.className = 'ip-category-name';
    name.textContent = section.label;
    name.addEventListener('click', () => this.store.toggleSelection(section.id), { signal });
    root.appendChild(name);

    const nodes = document.createElement('div');
    nodes.className = 'ip-nodes';
    for (const node of section.nodes) {
      const element = document.createElement('div');
      element.className = 'ip-node';
      element.dataset['nodeId'] = node.id;
      element.textContent = node.label;
      element.addEventListener('pointerenter', () => this.store.hoverNode(node.id, 'panel'), { signal });
      element.addEventListener('pointerleave', () => this.store.hoverNode(null, 'panel'), { signal });
      nodes.appendChild(element);
      this.nodeElements.set(node.id, element);
    }
    root.appendChild(nodes);

    this.root.appendChild(root);
    return { id: section.id, root, name };
  }

  private render(state: AppState): void {
    const hoveredId = state.hoveredRing?.id ?? null;
    const sceneNodeId = state.hoveredNode?.source === 'scene' ? state.hoveredNode.id : null;
    for (const category of this.categories) {
      category.root.classList.toggle('hovered', category.id === hoveredId);
      category.root.classList.toggle('selected', category.id === state.selectedRingId);
    }
    // A row hovered from the panel shows its own :hover style.
    for (const [id, element] of this.nodeElements) element.classList.toggle('scene-hovered', id === sceneNodeId);
  }

  private measure(): Layout {
    if (this.layout && this.runningTransitions === 0) return this.layout;
    const names = new Map<string, DOMRect>();
    for (const category of this.categories) names.set(category.id, category.name.getBoundingClientRect());
    this.layout = { panel: this.root.getBoundingClientRect(), names };
    return this.layout;
  }

  private readonly invalidateLayout = (): void => {
    this.layout = null;
  };

  private readonly onTransitionRun = (): void => {
    this.runningTransitions++;
  };

  private readonly onTransitionDone = (): void => {
    this.runningTransitions = Math.max(0, this.runningTransitions - 1);
    this.invalidateLayout();
  };

  private readonly onDocumentPointerMove = (e: PointerEvent): void => {
    const { panel, names } = this.measure();
    const x = e.clientX;
    const y = e.clientY;
    const mobile = window.innerWidth < MOBILE_BREAKPOINT;

    const topInflate = mobile ? PANEL_INFLATE_TOP_MOBILE : PANEL_INFLATE_V;
    const insidePanel =
      x >= panel.left - PANEL_INFLATE_LEFT &&
      x <= panel.right &&
      y >= panel.top - topInflate &&
      y <= panel.bottom + PANEL_INFLATE_V;
    if (!insidePanel) {
      this.store.hoverRing(null, 'panel');
      return;
    }

    // Once a category is hovered, only a direct hit on another name switches
    // it; moving across the expanded nodes keeps it.
    const { hoveredRing, selectedRingId } = this.store.getState();
    if (hoveredRing) {
      const hit = findNameHit(names, x, y, selectedRingId);
      if (hit !== null && hit !== hoveredRing.id) this.store.hoverRing(hit, 'panel');
      return;
    }
    const nearest = findNearestName(names, mobile ? x : y, mobile, selectedRingId);
    if (nearest !== null) this.store.hoverRing(nearest, 'panel');
  };

  private readonly onDocumentClick = (e: MouseEvent): void => {
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (this.sceneElement?.contains(target)) return;
    this.store.clearSelection();
  };
}

/** The unselected section whose inflated name rect contains the point. */
function findNameHit(names: ReadonlyMap<string, DOMRect>, x: number, y: number, selectedId: string | null): string | null {
  for (const [id, r] of names) {
    if (id === selectedId) continue;
    if (
      x >= r.left - NAME_INFLATE_LEFT &&
      x <= r.right + NAME_INFLATE_RIGHT &&
      y >= r.top - NAME_INFLATE_V &&
      y <= r.bottom + NAME_INFLATE_V
    ) {
      return id;
    }
  }
  return null;
}

/** The unselected section whose name centre is nearest: along x on mobile, y on desktop. */
function findNearestName(
  names: ReadonlyMap<string, DOMRect>,
  pointer: number,
  mobile: boolean,
  selectedId: string | null,
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const [id, r] of names) {
    if (id === selectedId) continue;
    const centre = mobile ? r.left + r.width / 2 : r.top + r.height / 2;
    const distance = Math.abs(pointer - centre);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

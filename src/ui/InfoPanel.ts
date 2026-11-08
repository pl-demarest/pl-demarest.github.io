import type { AppState, Store, Unsubscribe } from '../app/store';
import type { Section, SiteNode } from '../content/types';
import { isMobileWidth } from './breakpoints';

// Hover zones around the panel and around each category name, in CSS px.
const PANEL_INFLATE_LEFT = 60;
const PANEL_INFLATE_V = 12;
const PANEL_INFLATE_TOP_MOBILE = 48;
const NAME_INFLATE_LEFT = 40;
const NAME_INFLATE_RIGHT = 4;
const NAME_INFLATE_V = 6;

export interface InfoPanelOptions {
  /**
   * The scene's element. A click on it belongs to the scene, which reports
   * ring clicks and background clicks to the store itself, so the panel
   * does not treat it as a click outside.
   */
  sceneElement?: Element | null;
  /** Called when a node button is activated (click, Enter or Space). */
  onNodeActivate?: (node: SiteNode) => void;
}

interface Category {
  readonly id: string;
  readonly root: HTMLElement;
  readonly name: HTMLButtonElement;
  /** The node list the name controls (aria-controls). */
  readonly list: HTMLElement;
  readonly nodeButtons: readonly HTMLButtonElement[];
}

interface Layout {
  readonly panel: DOMRect;
  /** Category name rects by section id, in panel order. */
  readonly names: ReadonlyMap<string, DOMRect>;
}

/**
 * The section list beside the scene, and the scene's accessible equivalent.
 * Categories and nodes are buttons. Pointer proximity and keyboard focus
 * hover a category, a click or Enter or Space selects it, and Escape or a
 * click outside clears the selection. All of it goes through the store, and
 * the panel renders its classes and ARIA state from the store.
 *
 * Tab walks each category's name and then its nodes, and Shift+Tab walks
 * the same stops backward. A category's node buttons are in the tab order
 * while it is selected or holds keyboard focus, never because the pointer
 * is over it, so where the mouse rests does not change the tab order.
 */
export class InfoPanel {
  private readonly root: HTMLElement;
  private readonly store: Store;
  private sceneElement: Element | null;
  private readonly onNodeActivate: ((node: SiteNode) => void) | undefined;
  private readonly categories: Category[] = [];
  private readonly nodeButtons = new Map<string, HTMLButtonElement>();
  private readonly listeners = new AbortController();
  private readonly unsubscribe: Unsubscribe;
  /** Cached rects; null until measured and after anything that moves them. */
  private layout: Layout | null = null;
  /** CSS transitions running inside the panel; rects are read live while any run. */
  private runningTransitions = 0;
  /**
   * The category that holds keyboard focus. It stays expanded whatever the
   * pointer and the scene hover, so a focused button never collapses.
   */
  private keyboardFocusId: string | null = null;

  constructor(root: HTMLElement, sections: readonly Section[], store: Store, options: InfoPanelOptions = {}) {
    this.root = root;
    this.store = store;
    this.sceneElement = options.sceneElement ?? null;
    this.onNodeActivate = options.onNodeActivate;

    const { signal } = this.listeners;
    for (const section of sections) this.categories.push(this.buildCategory(section, signal));

    document.addEventListener('pointermove', this.onDocumentPointerMove, { passive: true, signal });
    // pointerleave does not bubble; the root element gets its own.
    document.documentElement.addEventListener('pointerleave', this.onPointerLeavePage, { signal });
    document.addEventListener('click', this.onDocumentClick, { signal });
    document.addEventListener('keydown', this.onKeyDown, { signal });
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
    this.nodeButtons.clear();
    this.layout = null;
    this.keyboardFocusId = null;
  }

  /** Set the scene's element (see InfoPanelOptions.sceneElement) once the scene exists. */
  setSceneElement(element: Element | null): void {
    this.sceneElement = element;
  }

  private buildCategory(section: Section, signal: AbortSignal): Category {
    const root = document.createElement('div');
    root.className = 'ip-category';
    root.dataset['ringId'] = section.id;

    const nodesId = `ip-nodes-${section.id}`;
    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'ip-category-name';
    name.textContent = section.label;
    name.setAttribute('aria-controls', nodesId);
    name.addEventListener('click', () => this.store.toggleSelection(section.id), { signal });
    root.appendChild(name);

    const nodes = document.createElement('div');
    nodes.className = 'ip-nodes';
    nodes.id = nodesId;
    const nodeButtons = section.nodes.map(node => {
      const button = this.buildNodeButton(node, signal);
      nodes.appendChild(button);
      return button;
    });
    root.appendChild(nodes);

    // Keyboard focus anywhere in the category hovers it the way the pointer
    // does, and keeps it expanded until focus leaves it. Focus that follows a
    // mouse or touch press is not :focus-visible, so a click changes the
    // selection and nothing else.
    root.addEventListener(
      'focusin',
      e => {
        if (!isKeyboardFocus(e.target)) return;
        this.setKeyboardFocus(section.id);
        this.store.hoverRing(section.id, 'panel');
      },
      { signal },
    );
    root.addEventListener(
      'focusout',
      e => {
        if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget)) return;
        if (this.keyboardFocusId === section.id) this.setKeyboardFocus(null);
        if (this.store.getState().hoveredRing?.id === section.id) this.store.hoverRing(null, 'panel');
      },
      { signal },
    );

    this.root.appendChild(root);
    return { id: section.id, root, name, list: nodes, nodeButtons };
  }

  private buildNodeButton(node: SiteNode, signal: AbortSignal): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ip-node';
    button.dataset['nodeId'] = node.id;
    button.textContent = node.label;

    const hover = (): void => this.store.hoverNode(node.id, 'panel');
    const unhover = (): void => {
      if (this.store.getState().hoveredNode?.id === node.id) this.store.hoverNode(null, 'panel');
    };
    button.addEventListener('pointerenter', hover, { signal });
    button.addEventListener('pointerleave', unhover, { signal });
    button.addEventListener(
      'focus',
      e => {
        if (isKeyboardFocus(e.target)) hover();
      },
      { signal },
    );
    button.addEventListener('blur', unhover, { signal });
    button.addEventListener('click', () => this.onNodeActivate?.(node), { signal });

    this.nodeButtons.set(node.id, button);
    return button;
  }

  private setKeyboardFocus(id: string | null): void {
    if (id === this.keyboardFocusId) return;
    this.keyboardFocusId = id;
    this.render(this.store.getState());
    this.invalidateLayout();
  }

  private render(state: AppState): void {
    const hoveredId = state.hoveredRing?.id ?? null;
    const sceneNodeId = state.hoveredNode?.source === 'scene' ? state.hoveredNode.id : null;
    let collapsedAroundFocus: Category | null = null;
    for (const category of this.categories) {
      const selected = category.id === state.selectedRingId;
      const focused = category.id === this.keyboardFocusId;
      // The selected category is never hovered (see Store.hoverRing).
      const hovered = !selected && (category.id === hoveredId || focused);
      category.root.classList.toggle('hovered', hovered);
      category.root.classList.toggle('selected', selected);
      const expanded = hovered || selected;
      const wasExpanded = category.name.getAttribute('aria-expanded') === 'true';
      category.name.setAttribute('aria-expanded', String(expanded));
      // The name toggles its section's selection; focus and hover expand it
      // too, so the selection has a state of its own.
      category.name.setAttribute('aria-pressed', String(selected));
      // CSS only shrinks a collapsed list to its padding (on mobile a 19 px
      // box above the bar) and lets the pointer through it; its node
      // buttons leave the accessibility tree here.
      if (expanded) category.list.removeAttribute('aria-hidden');
      else category.list.setAttribute('aria-hidden', 'true');
      // Selection and keyboard focus put them in the tab order; a pointer
      // hover expands the list and leaves the tab order alone.
      for (const button of category.nodeButtons) button.tabIndex = selected || focused ? 0 : -1;
      if (wasExpanded && !expanded && category.list.contains(document.activeElement)) collapsedAroundFocus = category;
    }
    // A row hovered from the panel shows its own :hover style.
    for (const [id, button] of this.nodeButtons) button.classList.toggle('scene-hovered', id === sceneNodeId);
    // A category that collapses around a node button focused by a click
    // (keyboard focus keeps its category open) would leave focus inside a
    // hidden list: focus moves to the category's name. Last, because the
    // blur can update the store and render again.
    collapsedAroundFocus?.name.focus();
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
    // A press on the scene captures its pointer: the moves of a drag target
    // the scene wherever the pointer is and reach the document only by
    // bubbling. They belong to the drag, not to the panel's hover.
    if (this.sceneElement?.hasPointerCapture(e.pointerId)) return;
    const { panel, names } = this.measure();
    const x = e.clientX;
    const y = e.clientY;
    const mobile = isMobileWidth(window.innerWidth);

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

  /**
   * The pointer left the page: a mouse out of the window, a pen out of
   * range, or a touch that lifted or that the browser took. No move outside
   * the panel follows to end the panel's hover, so it ends here.
   */
  private readonly onPointerLeavePage = (): void => {
    this.store.hoverRing(null, 'panel');
  };

  private readonly onDocumentClick = (e: MouseEvent): void => {
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (this.root.contains(target)) return;
    if (this.sceneElement?.contains(target)) return;
    this.store.clearSelection();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Tab' && e.shiftKey) {
      this.openTabStopsBehind(document.activeElement);
      return;
    }
    if (e.key !== 'Escape') return;
    this.store.clearSelection();
    // A category with keyboard focus in it stays expanded as a hover, with
    // focus on its name, so focus never rests on a collapsed node button.
    const active = document.activeElement;
    const focused = this.categories.find(c => c.root.contains(active));
    if (!focused || !isKeyboardFocus(active)) return;
    if (active !== focused.name) focused.name.focus();
    this.store.hoverRing(focused.id, 'panel');
  };

  /**
   * Shift+Tab from a category's name, or from nowhere (past the end of the
   * page), goes to the category before it. Tab reached that category's
   * nodes after its name, so going back reaches its last node first: its
   * node buttons join the tab order now, before the browser moves focus.
   * The keyboard focus they then get keeps them there (see render).
   */
  private openTabStopsBehind(active: Element | null): void {
    const atEnd = active === null || active === document.body;
    const index = atEnd ? this.categories.length : this.categories.findIndex(c => c.name === active);
    const previous = index > 0 ? this.categories[index - 1] : undefined;
    for (const button of previous?.nodeButtons ?? []) button.tabIndex = 0;
  }
}

function isKeyboardFocus(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(':focus-visible');
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

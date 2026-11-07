/** Where a hover came from: the 3D scene, or the panel (pointer or keyboard focus). */
export type HoverSource = 'scene' | 'panel';

export interface Hover {
  readonly id: string;
  readonly source: HoverSource;
}

export interface AppState {
  /** The ring under the pointer, by ring id. Never the selected ring. */
  readonly hoveredRing: Hover | null;
  /** The node under the pointer or focus, by node id. */
  readonly hoveredNode: Hover | null;
  readonly selectedRingId: string | null;
}

export type Unsubscribe = () => void;

const INITIAL_STATE: AppState = { hoveredRing: null, hoveredNode: null, selectedRingId: null };

/**
 * The state the scene and the panel share. Each side changes it only through
 * the actions below and renders from it through subscribe(); neither side
 * calls the other.
 */
export class Store {
  private state: AppState = INITIAL_STATE;
  private readonly listeners = new Set<() => void>();

  getState(): AppState {
    return this.state;
  }

  /**
   * Call `listener(value, previous)` each time `selector(state)` changes,
   * compared with Object.is. It is not called for the value at subscription.
   */
  subscribe<T>(selector: (state: AppState) => T, listener: (value: T, previous: T) => void): Unsubscribe {
    let current = selector(this.state);
    const check = (): void => {
      const next = selector(this.state);
      if (Object.is(next, current)) return;
      const previous = current;
      current = next;
      listener(next, previous);
    };
    this.listeners.add(check);
    return () => {
      this.listeners.delete(check);
    };
  }

  /**
   * Report the ring `source` is over, or null when that source's hover ends.
   * A null from one source leaves the other source's hover alone. The
   * selected ring is never hovered, so reporting it ends the source's hover.
   */
  hoverRing(id: string | null, source: HoverSource): void {
    const target = id !== null && id === this.state.selectedRingId ? null : id;
    const hoveredRing = nextHover(this.state.hoveredRing, target, source);
    if (hoveredRing !== this.state.hoveredRing) this.update({ hoveredRing });
  }

  /** Report the node `source` is over, or null when that source's hover ends. */
  hoverNode(id: string | null, source: HoverSource): void {
    const hoveredNode = nextHover(this.state.hoveredNode, id, source);
    if (hoveredNode !== this.state.hoveredNode) this.update({ hoveredNode });
  }

  /** Select ring `id`, or deselect it when it is already selected. */
  toggleSelection(id: string): void {
    const { selectedRingId, hoveredRing } = this.state;
    if (selectedRingId === id) {
      this.update({ selectedRingId: null });
      return;
    }
    this.update({ selectedRingId: id, hoveredRing: hoveredRing?.id === id ? null : hoveredRing });
  }

  clearSelection(): void {
    if (this.state.selectedRingId !== null) this.update({ selectedRingId: null });
  }

  private update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) {
      // A listener earlier in this pass may have unsubscribed this one.
      if (this.listeners.has(listener)) listener();
    }
  }
}

/** The hover after `source` reports `id`; null ends that source's hover only. */
function nextHover(current: Hover | null, id: string | null, source: HoverSource): Hover | null {
  if (id === null) return current?.source === source ? null : current;
  if (current?.id === id && current.source === source) return current;
  return { id, source };
}

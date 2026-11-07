import { describe, expect, it, vi } from 'vitest';
import { Store } from '../../src/app/store';

describe('Store.subscribe', () => {
  it('calls the listener with the new and the previous value, only when the selection changes', () => {
    const store = new Store();
    const listener = vi.fn();
    store.subscribe(s => s.selectedRingId, listener);
    expect(listener).not.toHaveBeenCalled();

    store.toggleSelection('a');
    expect(listener).toHaveBeenLastCalledWith('a', null);
    store.hoverNode('x', 'scene'); // another part of the state
    expect(listener).toHaveBeenCalledTimes(1);
    store.toggleSelection('b');
    expect(listener).toHaveBeenLastCalledWith('b', 'a');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops calling a listener once it unsubscribes, even in the middle of a notification', () => {
    const store = new Store();
    const second = vi.fn();
    let unsubscribeSecond = () => {};
    store.subscribe(
      s => s.selectedRingId,
      () => unsubscribeSecond(),
    );
    unsubscribeSecond = store.subscribe(s => s.selectedRingId, second);
    store.toggleSelection('a');
    expect(second).not.toHaveBeenCalled();
  });
});

describe('Store hover', () => {
  it('a null report ends only the reporting source\'s hover', () => {
    const store = new Store();
    store.hoverRing('a', 'scene');
    store.hoverRing(null, 'panel');
    expect(store.getState().hoveredRing).toEqual({ id: 'a', source: 'scene' });
    store.hoverRing(null, 'scene');
    expect(store.getState().hoveredRing).toBeNull();
  });

  it('the other source reporting the same ring takes the hover over', () => {
    const store = new Store();
    store.hoverRing('a', 'panel');
    store.hoverRing('a', 'scene');
    expect(store.getState().hoveredRing).toEqual({ id: 'a', source: 'scene' });
    store.hoverRing(null, 'panel');
    expect(store.getState().hoveredRing).toEqual({ id: 'a', source: 'scene' });
  });

  it('does not notify when a report changes nothing', () => {
    const store = new Store();
    const listener = vi.fn();
    store.subscribe(s => s, listener);
    store.hoverRing('a', 'scene');
    store.hoverRing('a', 'scene');
    store.hoverNode(null, 'panel');
    store.clearSelection();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never hovers the selected ring, and selecting the hovered ring ends its hover', () => {
    const store = new Store();
    store.hoverRing('a', 'scene');
    store.toggleSelection('a');
    expect(store.getState()).toMatchObject({ selectedRingId: 'a', hoveredRing: null });

    store.hoverRing('b', 'scene');
    store.hoverRing('a', 'scene'); // over the selected ring now
    expect(store.getState().hoveredRing).toBeNull();

    store.hoverRing('b', 'panel');
    store.toggleSelection('c'); // another ring: the hover stays
    expect(store.getState().hoveredRing).toEqual({ id: 'b', source: 'panel' });
  });

  it('node hover follows the same source rules', () => {
    const store = new Store();
    store.hoverNode('n1', 'panel');
    store.hoverNode(null, 'scene');
    expect(store.getState().hoveredNode).toEqual({ id: 'n1', source: 'panel' });
    store.hoverNode('n2', 'scene');
    expect(store.getState().hoveredNode).toEqual({ id: 'n2', source: 'scene' });
    store.hoverNode(null, 'scene');
    expect(store.getState().hoveredNode).toBeNull();
  });
});

describe('Store selection', () => {
  it('toggleSelection selects, moves and deselects', () => {
    const store = new Store();
    store.toggleSelection('a');
    expect(store.getState().selectedRingId).toBe('a');
    store.toggleSelection('b');
    expect(store.getState().selectedRingId).toBe('b');
    store.toggleSelection('b');
    expect(store.getState().selectedRingId).toBeNull();
  });

  it('clearSelection deselects', () => {
    const store = new Store();
    store.toggleSelection('a');
    store.clearSelection();
    expect(store.getState().selectedRingId).toBeNull();
  });
});

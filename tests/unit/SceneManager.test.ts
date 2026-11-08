// @vitest-environment happy-dom
import type * as ThreeModule from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneManager } from '../../src/scene/SceneManager';
import { setViewport } from './net-gaps/viewport';

// happy-dom has no WebGL: the renderer is a stub that records the pixel
// ratio and size it is given.
const calls = vi.hoisted(() => ({
  pixelRatio: [] as number[],
  size: [] as Array<[number, number]>,
  loop: null as ((time: number) => void) | null,
}));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof ThreeModule>();
  class StubRenderer {
    setPixelRatio(ratio: number): void {
      calls.pixelRatio.push(ratio);
    }
    setSize(width: number, height: number): void {
      calls.size.push([width, height]);
    }
    setAnimationLoop(loop: ((time: number) => void) | null): void {
      calls.loop = loop;
    }
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: StubRenderer };
});

const last = <T>(list: readonly T[]): T | undefined => list[list.length - 1];

function setPixelRatio(ratio: number): void {
  Object.defineProperty(window, 'devicePixelRatio', { value: ratio, configurable: true });
}

/** A matchMedia whose queries the test changes by hand, as a display change does. */
function fakeMatchMedia() {
  const queries: Array<{ media: string; fire: () => void }> = [];
  vi.stubGlobal('matchMedia', (media: string) => {
    const listeners: Array<{ listener: () => void; signal?: AbortSignal; once?: boolean }> = [];
    queries.push({
      media,
      fire: () => {
        for (const entry of listeners.splice(0)) {
          if (!entry.signal?.aborted) entry.listener();
          if (!entry.once && !entry.signal?.aborted) listeners.push(entry);
        }
      },
    });
    return {
      media,
      matches: true,
      addEventListener: (_type: string, listener: () => void, options?: AddEventListenerOptions) =>
        listeners.push({ listener, signal: options?.signal, once: options?.once }),
      removeEventListener: () => {},
    };
  });
  return queries;
}

describe('SceneManager pixel ratio', () => {
  beforeEach(() => {
    calls.pixelRatio = [];
    calls.size = [];
    calls.loop = null;
    setViewport(1024, 768);
    setPixelRatio(1);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setPixelRatio(1);
    setViewport(1024, 768);
  });

  it('reads the pixel ratio again on a resize, as a browser zoom changes both', () => {
    const sm = new SceneManager(document.createElement('canvas'));
    expect(calls.pixelRatio).toEqual([1]);
    // Zoom to 200 %: the ratio doubles and the CSS viewport halves.
    setPixelRatio(2);
    setViewport(512, 384);
    expect(last(calls.pixelRatio)).toBe(2);
    expect(last(calls.size)).toEqual([512, 384]);
    // Capped at 2, as at construction.
    setPixelRatio(3);
    setViewport(341, 256);
    expect(last(calls.pixelRatio)).toBe(2);
    sm.dispose();
  });

  it('follows a pixel ratio change that comes without a resize, as on a move to another display', () => {
    const queries = fakeMatchMedia();
    const sm = new SceneManager(document.createElement('canvas'));
    expect(queries.map(q => q.media)).toEqual(['(resolution: 1dppx)']);
    setPixelRatio(1.5);
    queries[0]!.fire();
    expect(last(calls.pixelRatio)).toBe(1.5);
    // It watches the new ratio from then on.
    expect(queries.map(q => q.media)).toEqual(['(resolution: 1dppx)', '(resolution: 1.5dppx)']);
    setPixelRatio(1);
    queries[1]!.fire();
    expect(last(calls.pixelRatio)).toBe(1);

    sm.dispose();
    const count = calls.pixelRatio.length;
    setPixelRatio(2);
    for (const q of queries) q.fire();
    expect(calls.pixelRatio).toHaveLength(count);
  });
});

describe('SceneManager', () => {
  afterEach(() => {
    setViewport(1024, 768);
  });

  it('caps the step it passes to tick callbacks at 0.05 s, as after a stalled tab', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const sm = new SceneManager(document.createElement('canvas'));
    const steps: number[] = [];
    sm.onTick(dt => steps.push(dt));
    sm.start();
    now += 1000 / 60;
    calls.loop?.(now);
    now += 200;
    calls.loop?.(now);
    expect(steps[0]).toBeCloseTo(1 / 60, 12);
    expect(steps[1]).toBe(0.05);
    sm.dispose();
  });

  it('dispose() stops the loop and stops following window resizes', () => {
    const sm = new SceneManager(document.createElement('canvas'));
    sm.start();
    sm.dispose();
    expect(calls.loop).toBeNull();
    const sizes = calls.size.length;
    setViewport(800, 600);
    expect(calls.size).toHaveLength(sizes);
  });
});

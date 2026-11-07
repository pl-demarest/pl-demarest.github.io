// @vitest-environment happy-dom
import type * as ThreeModule from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/app/App';
import { SECTIONS } from '../../src/content/site';

// happy-dom has no WebGL, so the renderer is stubbed; everything else is real.
vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof ThreeModule>();
  class StubRenderer {
    setPixelRatio(): void {}
    setSize(): void {}
    setAnimationLoop(): void {}
    render(): void {}
  }
  return { ...actual, WebGLRenderer: StubRenderer };
});

const PAGE = '<header id="header"></header><canvas id="scene"></canvas><div id="info-panel"></div>';

describe('App', () => {
  let app: App;

  beforeEach(() => {
    document.body.innerHTML = PAGE;
    app = new App(document.getElementById('scene') as HTMLCanvasElement);
  });
  afterEach(() => {
    app.dispose();
    document.body.innerHTML = '';
  });

  it('builds the header and one panel category per section', () => {
    expect(document.querySelector('.header-name')?.textContent).toBe('Phillip Demarest, PhD');
    const ids = [...document.querySelectorAll<HTMLElement>('.ip-category')].map(c => c.dataset['ringId']);
    expect(ids).toEqual(SECTIONS.map(s => s.id));
  });

  it('routes panel clicks and scene hovers through its store', () => {
    document.querySelector<HTMLElement>('.ip-category[data-ring-id="projects"] .ip-category-name')!.click();
    expect(app.store.getState().selectedRingId).toBe('projects');

    app.store.hoverNode('papers', 'scene');
    expect(document.querySelector('.ip-node.scene-hovered')?.getAttribute('data-node-id')).toBe('papers');
  });

  it('dispose() disconnects the panel from the store and the document', () => {
    app.dispose();
    expect(document.querySelectorAll('.ip-category')).toHaveLength(0);
    app.store.toggleSelection('projects');
    document.body.click();
    expect(app.store.getState().selectedRingId).toBe('projects');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MOBILE_MAX_WIDTH, isMobileWidth } from '../../src/ui/breakpoints';

const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

describe('mobile breakpoint', () => {
  it('style.css switches to the mobile layout at the width the scripts use', () => {
    const widths = [...css.matchAll(/@media\s*\(\s*max-width:\s*(\d+)px\s*\)/g)].map(m => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    expect(widths.every(w => w === MOBILE_MAX_WIDTH)).toBe(true);
    // No min-width query that could start the desktop layout elsewhere.
    expect(css).not.toMatch(/min-width:/);
  });

  it('treats 767 px and below as mobile', () => {
    expect(isMobileWidth(375)).toBe(true);
    expect(isMobileWidth(767)).toBe(true);
    expect(isMobileWidth(768)).toBe(false);
  });
});

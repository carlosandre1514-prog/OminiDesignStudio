import { describe, expect, it } from 'vitest';
import { detectProfile } from './useDeviceProfile';
import { keepsArrow, pickNext, type Box } from './spatialNav';

// A 3×2 grid of buttons, 100×40 each with 20px gaps, plus a wide button below.
const grid: Box[] = [
  { x: 0, y: 0, w: 100, h: 40 }, { x: 120, y: 0, w: 100, h: 40 }, { x: 240, y: 0, w: 100, h: 40 },
  { x: 0, y: 60, w: 100, h: 40 }, { x: 120, y: 60, w: 100, h: 40 }, { x: 240, y: 60, w: 100, h: 40 },
  { x: 0, y: 120, w: 340, h: 40 },
];
const nav = (from: number, dir: 'up' | 'down' | 'left' | 'right') => {
  const others = grid.filter((_, i) => i !== from);
  const i = pickNext(grid[from], others, dir);
  return i < 0 ? -1 : grid.indexOf(others[i]);
};

describe('spatial navigation', () => {
  it('moves within rows and columns', () => {
    expect(nav(0, 'right')).toBe(1);
    expect(nav(1, 'right')).toBe(2);
    expect(nav(2, 'right')).toBe(-1);
    expect(nav(1, 'down')).toBe(4);
    expect(nav(4, 'up')).toBe(1);
    expect(nav(5, 'left')).toBe(4);
    expect(nav(4, 'down')).toBe(6);
    expect(nav(6, 'up')).toBe(4); // wide button: the control right above its centre
  });

  it('skips candidates overlapping the current element in the travel direction', () => {
    const viewport: Box = { x: 0, y: 0, w: 1400, h: 900 };
    const inside: Box = { x: 1300, y: 840, w: 50, h: 50 };
    const panel: Box = { x: 1420, y: 100, w: 150, h: 60 };
    expect(pickNext(viewport, [inside, panel], 'right')).toBe(1);
  });

  it('lets sliders and text fields keep their own arrows', () => {
    const range = Object.assign(document.createElement('input'), { type: 'range' });
    expect(keepsArrow(range, 'left')).toBe(true);
    expect(keepsArrow(range, 'down')).toBe(false);
    const text = document.createElement('input');
    text.value = 'abc';
    text.setSelectionRange(1, 1);
    expect(keepsArrow(text, 'left')).toBe(true);
    text.setSelectionRange(0, 0);
    expect(keepsArrow(text, 'left')).toBe(false);
    const vp = document.createElement('div');
    vp.dataset.navCapture = 'arrows';
    expect(keepsArrow(vp, 'up')).toBe(true);
  });

  it('detects device profiles', () => {
    expect(detectProfile('Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)', false, 1920)).toBe('tv');
    expect(detectProfile('Mozilla/5.0 (Linux; Android 14; Pixel 7)', true, 412)).toBe('mobile');
    expect(detectProfile('Mozilla/5.0 (Windows NT 10.0)', false, 1440)).toBe('pc');
  });
});

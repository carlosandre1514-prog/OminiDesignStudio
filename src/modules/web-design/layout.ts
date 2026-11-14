import { safeColor } from '@/core/utils/sanitize';
import type { WDElement, WDScreen, WDStyle } from './model';

export type CssMap = Record<string, string>;

const px = (n: number) => `${Math.round(n * 100) / 100}px`;
const pct = (n: number) => `${Math.round(n * 10000) / 100}%`;

/**
 * Position/size CSS for an element, derived from its constraints relative to the screen.
 * The same output drives the responsive preview and the exported code so they always match.
 */
export function boxCss(el: WDElement, screen: Pick<WDScreen, 'width' | 'height'>): CssMap {
  const W = screen.width;
  const H = screen.height;
  const css: CssMap = { position: 'absolute' };
  switch (el.constraintH) {
    case 'left':
      Object.assign(css, { left: px(el.x), width: px(el.w) });
      break;
    case 'right':
      Object.assign(css, { right: px(W - el.x - el.w), width: px(el.w) });
      break;
    case 'center':
      Object.assign(css, { left: `calc(50% + ${px(el.x - W / 2)})`, width: px(el.w) });
      break;
    case 'stretch':
      Object.assign(css, { left: px(el.x), right: px(W - el.x - el.w) });
      break;
    case 'scale':
      Object.assign(css, { left: pct(el.x / W), width: pct(el.w / W) });
      break;
  }
  switch (el.constraintV) {
    case 'top':
      Object.assign(css, { top: px(el.y), height: px(el.h) });
      break;
    case 'bottom':
      Object.assign(css, { bottom: px(H - el.y - el.h), height: px(el.h) });
      break;
    case 'center':
      Object.assign(css, { top: `calc(50% + ${px(el.y - H / 2)})`, height: px(el.h) });
      break;
    case 'stretch':
      Object.assign(css, { top: px(el.y), bottom: px(H - el.y - el.h) });
      break;
    case 'scale':
      Object.assign(css, { top: pct(el.y / H), height: pct(el.h / H) });
      break;
  }
  return css;
}

export function shadowCss(s: WDStyle['shadow']): string | undefined {
  if (!s) return undefined;
  return `${px(s.x)} ${px(s.y)} ${px(s.blur)} ${px(s.spread)} ${safeColor(s.color, 'rgba(0,0,0,0.2)')}`;
}

/** Visual CSS (colours, borders, typography) for an element. */
export function visualCss(el: WDElement): CssMap {
  const s = el.style;
  const css: CssMap = {
    'box-sizing': 'border-box',
    'font-family': s.fontFamily.replace(/[;{}<>]/g, ''),
    'font-size': px(s.fontSize),
    'font-weight': String(s.fontWeight),
    color: safeColor(s.textColor, '#111827'),
    'text-align': s.textAlign,
  };
  if (el.type !== 'group') css['background-color'] = safeColor(s.fill);
  if (s.borderWidth > 0) css.border = `${px(s.borderWidth)} solid ${safeColor(s.borderColor, '#000')}`;
  if (s.borderRadius > 0) css['border-radius'] = el.type === 'ellipse' ? '50%' : px(s.borderRadius);
  if (el.type === 'ellipse') css['border-radius'] = '50%';
  const sh = shadowCss(s.shadow);
  if (sh) css['box-shadow'] = sh;
  if (s.opacity < 1) css.opacity = String(Math.max(0, s.opacity));
  if (s.padding > 0) css.padding = px(s.padding);
  switch (el.type) {
    case 'button':
    case 'icon':
      Object.assign(css, { display: 'flex', 'align-items': 'center', 'justify-content': s.textAlign === 'left' ? 'flex-start' : s.textAlign === 'right' ? 'flex-end' : 'center', cursor: 'pointer', 'user-select': 'none' });
      break;
    case 'text':
      Object.assign(css, { 'white-space': 'pre-wrap', 'overflow-wrap': 'break-word', 'line-height': '1.3' });
      break;
    case 'navbar':
      Object.assign(css, { display: 'flex', 'align-items': 'center', 'justify-content': 'space-between', 'padding-top': '0', 'padding-bottom': '0' });
      break;
    case 'menu':
      Object.assign(css, { display: 'flex', 'flex-direction': 'column', gap: '4px' });
      break;
    case 'card':
    case 'modal':
      Object.assign(css, { display: 'flex', 'flex-direction': 'column', gap: '8px', overflow: 'hidden' });
      break;
    case 'image':
      css.overflow = 'hidden';
      break;
    case 'frame':
      css.overflow = 'hidden';
      break;
  }
  return css;
}

export function hoverCss(el: WDElement): CssMap | null {
  if (!el.hover) return null;
  const css: CssMap = {};
  if (el.hover.fill) css['background-color'] = safeColor(el.hover.fill);
  if (el.hover.textColor) css.color = safeColor(el.hover.textColor);
  if (el.hover.borderColor && el.style.borderWidth > 0) css['border-color'] = safeColor(el.hover.borderColor);
  return Object.keys(css).length ? css : null;
}

export function cssToString(css: CssMap, indent = '  '): string {
  return Object.entries(css)
    .map(([k, v]) => `${indent}${k}: ${v};`)
    .join('\n');
}

/** Convert kebab CSS map to a React style object. */
export function cssToReact(css: CssMap): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(css)) out[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
  return out;
}

/** Elements rendered as DOM nodes (groups are organisational only and are flattened). */
export function renderableElements(screen: WDScreen): WDElement[] {
  return screen.elements.filter((e) => e.type !== 'group' && isEffectivelyVisible(screen, e));
}

export function isEffectivelyVisible(screen: WDScreen, el: WDElement): boolean {
  let cur: WDElement | undefined = el;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parentId ? screen.elements.find((e) => e.id === cur!.parentId) : undefined;
  }
  return true;
}

export interface DevicePreset {
  id: string;
  label: string;
  width: number;
  height: number;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  { id: 'phone-s', label: 'Smartphone pequeno', width: 360, height: 740 },
  { id: 'phone', label: 'Smartphone', width: 390, height: 844 },
  { id: 'tablet', label: 'Tablet', width: 820, height: 1180 },
  { id: 'tablet-l', label: 'Tablet paisagem', width: 1180, height: 820 },
  { id: 'laptop', label: 'Notebook', width: 1366, height: 768 },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900 },
  { id: 'fullhd', label: 'Full HD', width: 1920, height: 1080 },
  { id: 'ultrawide', label: 'Ultrawide', width: 2560, height: 1080 },
];

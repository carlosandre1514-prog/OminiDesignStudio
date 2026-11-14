import { cascadeOrder, hasGeometry, mediaQuery } from '../breakpoints';
import { boxCss, exportableElements, fullBoxCss, isEffectivelyVisible, naturalDisplay, stateCss, visualCss, type CssMap, type StateName } from '../layout';
import type { Transition, WDElement, WDScreen, WebDesignDoc } from '../model';

export interface RenderNode {
  /** Element with instance text overrides applied. */
  el: WDElement;
  /** Unique, CSS-safe key (used for class names). */
  key: string;
  /** Base CSS (box + visuals). */
  css: CssMap;
  states: Partial<Record<StateName, CssMap>>;
  /** Breakpoint rules in cascade order. */
  media: { query: string; minOrMax: 'min' | 'max'; width: number; css: CssMap }[];
  /** Children of a component instance. */
  children: RenderNode[];
  /** True for top-level screen elements (they can be toggle targets). */
  topLevel: boolean;
}

const safeKey = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '');
const MAX_DEPTH = 8;

function nodeFor(doc: WebDesignDoc, el: WDElement, frame: WDScreen, key: string, topLevel: boolean, depth: number): RenderNode {
  const css: CssMap = { ...boxCss(el, frame), ...visualCss(el) };
  if (el.type === 'instance') css.overflow = 'hidden';
  if (topLevel && !isEffectivelyVisible(frame, el)) css.display = 'none';
  const states: RenderNode['states'] = {};
  for (const st of ['hover', 'pressed', 'focus'] as const) {
    const c = stateCss(el, st);
    if (c) states[st] = c;
  }
  const media: RenderNode['media'] = [];
  if (topLevel) {
    for (const bp of cascadeOrder(doc.breakpoints)) {
      const o = el.overrides?.[bp.id];
      if (!o) continue;
      const m: CssMap = {};
      if (hasGeometry(o)) Object.assign(m, fullBoxCss({ ...el, x: o.x ?? el.x, y: o.y ?? el.y, w: o.w ?? el.w, h: o.h ?? el.h }, { width: bp.previewWidth, height: frame.height }));
      if (o.visible !== undefined) m.display = o.visible ? naturalDisplay(el) : 'none';
      if (o.fontSize !== undefined) m['font-size'] = `${o.fontSize}px`;
      if (Object.keys(m).length) media.push({ query: mediaQuery(bp), minOrMax: bp.mode, width: bp.width, css: m });
    }
  }
  let children: RenderNode[] = [];
  if (el.type === 'instance' && depth < MAX_DEPTH) {
    const comp = doc.components.find((c) => c.id === el.componentId);
    if (comp) {
      children = exportableElements(comp)
        .filter((c) => isEffectivelyVisible(comp, c))
        .map((c) => {
          const text = el.textOverrides?.[c.id];
          return nodeFor(doc, text !== undefined ? { ...c, text } : c, comp, `${key}__${safeKey(c.id)}`, false, depth + 1);
        });
    }
  }
  return { el, key, css, states, media, children, topLevel };
}

/** Everything an exporter needs to render a screen. */
export function buildRenderTree(doc: WebDesignDoc, screen: WDScreen): RenderNode[] {
  return exportableElements(screen).map((el) => nodeFor(doc, el, screen, safeKey(el.id), true, 0));
}

export function walk(nodes: RenderNode[], fn: (n: RenderNode) => void): void {
  for (const n of nodes) {
    fn(n);
    walk(n.children, fn);
  }
}

export const KEYFRAMES: Record<Exclude<Transition, 'none'>, string> = {
  fade: 'from { opacity: 0; }',
  'slide-left': 'from { translate: 100% 0; }',
  'slide-right': 'from { translate: -100% 0; }',
  'slide-up': 'from { translate: 0 100%; }',
  'slide-down': 'from { translate: 0 -100%; }',
  zoom: 'from { opacity: 0; scale: 0.92; }',
};

export function keyframesCss(): string {
  const blocks = Object.entries(KEYFRAMES).map(([k, v]) => `@keyframes omni-${k} { ${v} }`);
  return `${blocks.join('\n')}\n@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }`;
}

export function animationValue(t: Transition | undefined, duration = 300): string | null {
  if (!t || t === 'none') return null;
  return `omni-${t} ${Math.max(0, Math.round(duration))}ms ease both`;
}

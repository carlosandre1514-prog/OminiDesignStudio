import { useEffect, useState } from 'react';
import { escapeHtml } from '@/core/utils/sanitize';

/** Lucide icon node: list of [tag, attributes] children of a 24×24 SVG. */
export type IconNode = [string, Record<string, string | number>][];

let icons: Record<string, IconNode> | null = null;
let loading: Promise<Record<string, IconNode>> | null = null;

/** Loads the icon set (separate chunk, only downloaded when icons are used). */
export function loadIcons(): Promise<Record<string, IconNode>> {
  if (icons) return Promise.resolve(icons);
  loading ??= import('lucide').then((m) => (icons = m.icons as unknown as Record<string, IconNode>));
  return loading;
}

export const getLoadedIcons = () => icons;

export function useIcons(enabled = true): Record<string, IconNode> | null {
  const [set, setSet] = useState(icons);
  useEffect(() => {
    if (!enabled || set) return;
    let alive = true;
    void loadIcons().then((i) => alive && setSet(i));
    return () => {
      alive = false;
    };
  }, [enabled, set]);
  return set;
}

const ALLOWED_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ALLOWED_ATTRS = /^(d|cx|cy|r|rx|ry|x|y|x1|y1|x2|y2|width|height|points)$/;

/** SVG markup for an icon (built from trusted vector data; attributes whitelisted and escaped). */
export function iconSvg(name: string | undefined, set = icons): string {
  const node = name && set ? set[name] : undefined;
  if (!node) return '';
  const children = node
    .filter(([tag]) => ALLOWED_TAGS.has(tag))
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => ALLOWED_ATTRS.test(k))
        .map(([k, v]) => `${k}="${escapeHtml(String(v))}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`;
}

/** Same icon as JSX markup (for the React exporter). */
export function iconJsx(name: string | undefined, set = icons): string {
  return iconSvg(name, set)
    .replace(/stroke-width=/g, 'strokeWidth=')
    .replace(/stroke-linecap=/g, 'strokeLinecap=')
    .replace(/stroke-linejoin=/g, 'strokeLinejoin=')
    .replace(/aria-hidden="true"/, 'aria-hidden');
}

/** Human readable label: "ArrowLeft" -> "Arrow Left". */
export const iconLabel = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');

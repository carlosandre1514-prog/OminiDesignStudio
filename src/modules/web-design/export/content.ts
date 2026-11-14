import { escapeHtml, safeUrl } from '@/core/utils/sanitize';
import { iconJsx, iconSvg } from '../icons';
import type { WDElement } from '../model';

/** HTML tag used as the element's root node. */
export function rootTag(el: WDElement): string {
  switch (el.type) {
    case 'button':
      return 'button';
    case 'navbar':
      return 'header';
    case 'menu':
      return 'nav';
    case 'modal':
      return 'section';
    case 'card':
      return 'article';
    case 'text':
      return 'p';
    default:
      return 'div';
  }
}

const IMG_STYLE = 'width:100%;height:100%;object-fit:cover;display:block';
const INPUT_STYLE = 'width:100%;height:100%;border:0;outline:0;background:transparent;font:inherit;color:inherit';
const LINK_STYLE = 'color:inherit;text-decoration:none;padding:6px 8px;border-radius:4px';

/** Inner HTML of an element (escaped). */
export function innerHtml(el: WDElement, indent: string): string {
  const t = escapeHtml(el.text ?? '');
  const items = (el.items ?? []).map((i) => escapeHtml(i));
  switch (el.type) {
    case 'icon':
      return iconSvg(el.iconName) || t;
    case 'text':
    case 'button':
      return t;
    case 'image': {
      const src = safeUrl(el.src);
      return src ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(el.name)}" style="${IMG_STYLE}" />` : '';
    }
    case 'input':
      return `<input type="text" placeholder="${escapeHtml(el.placeholder ?? '')}" value="${t}" aria-label="${escapeHtml(el.name)}"${el.disabled ? ' disabled' : ''} style="${INPUT_STYLE}" />`;
    case 'card':
    case 'modal':
      return `\n${indent}  <h3 style="margin:0;font-size:inherit;font-weight:inherit">${t}</h3>\n${indent}  <p style="margin:0;font-size:0.8em;font-weight:400;opacity:0.8">${escapeHtml(el.subtext ?? '')}</p>\n${indent}`;
    case 'navbar':
      return `\n${indent}  <strong>${t}</strong>\n${indent}  <nav style="display:flex;gap:16px">${items.map((i) => `<a href="#" style="${LINK_STYLE}">${i}</a>`).join('')}</nav>\n${indent}`;
    case 'menu':
      return items.map((i) => `\n${indent}  <a href="#" style="${LINK_STYLE}">${i}</a>`).join('') + `\n${indent}`;
    default:
      return '';
  }
}

/** JSX string for the element's inner content (React export). */
export function innerJsx(el: WDElement, indent: string): string {
  const jsxText = (s: string) => escapeHtml(s).replace(/[{}]/g, (c) => (c === '{' ? '&#123;' : '&#125;'));
  const t = jsxText(el.text ?? '');
  const lit = (s: string) => JSON.stringify(s);
  const items = el.items ?? [];
  const link = `{ color: 'inherit', textDecoration: 'none', padding: '6px 8px', borderRadius: 4 }`;
  switch (el.type) {
    case 'icon':
      return iconJsx(el.iconName) || t;
    case 'text':
    case 'button':
      return t;
    case 'image': {
      const src = safeUrl(el.src);
      return src
        ? `<img src={${lit(src)}} alt={${lit(el.name)}} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />`
        : '';
    }
    case 'input':
      return `<input type="text" placeholder={${lit(el.placeholder ?? '')}} defaultValue={${lit(el.text ?? '')}} aria-label={${lit(el.name)}}${el.disabled ? ' disabled' : ''} style={{ width: '100%', height: '100%', border: 0, outline: 0, background: 'transparent', font: 'inherit', color: 'inherit' }} />`;
    case 'card':
    case 'modal':
      return `\n${indent}  <h3 style={{ margin: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>${t}</h3>\n${indent}  <p style={{ margin: 0, fontSize: '0.8em', fontWeight: 400, opacity: 0.8 }}>${jsxText(el.subtext ?? '')}</p>\n${indent}`;
    case 'navbar':
      return `\n${indent}  <strong>${t}</strong>\n${indent}  <nav style={{ display: 'flex', gap: 16 }}>\n${items.map((i) => `${indent}    <a href="#" style={${link}}>${jsxText(i)}</a>`).join('\n')}\n${indent}  </nav>\n${indent}`;
    case 'menu':
      return items.map((i) => `\n${indent}  <a href="#" style={${link}}>${jsxText(i)}</a>`).join('') + `\n${indent}`;
    default:
      return '';
  }
}

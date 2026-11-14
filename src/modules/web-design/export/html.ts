import { escapeHtml, safeColor, safeUrl, slugify } from '@/core/utils/sanitize';
import { boxCss, cssToString, hoverCss, renderableElements, visualCss } from '../layout';
import type { WDElement, WDScreen, WebDesignDoc } from '../model';
import { innerHtml, rootTag } from './content';

export type FileMap = Record<string, string>;

export function screenFileNames(doc: WebDesignDoc): Map<string, string> {
  const used = new Set<string>();
  const map = new Map<string, string>();
  doc.screens.forEach((s, i) => {
    let name = i === 0 ? 'index' : slugify(s.name, `tela-${i + 1}`);
    if (name === 'index' && i !== 0) name = `index-${i + 1}`;
    let candidate = name;
    let n = 2;
    while (used.has(candidate)) candidate = `${name}-${n++}`;
    used.add(candidate);
    map.set(s.id, `${candidate}.html`);
  });
  return map;
}

export const cls = (el: WDElement) => `el-${el.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
export const screenCls = (s: WDScreen) => `screen-${s.id.replace(/[^a-zA-Z0-9_-]/g, '')}`;

export function buildCss(doc: WebDesignDoc): string {
  const parts: string[] = [
    '/* Gerado pelo OmniDesign Studio */',
    '*, *::before, *::after { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; }',
    '.is-hidden { display: none !important; }',
    '[data-navigate], [data-toggle], [data-href] { cursor: pointer; }',
  ];
  for (const s of doc.screens) {
    parts.push(`\n/* ${s.name.replace(/\*\//g, '')} */`);
    parts.push(`.${screenCls(s)} {\n  position: relative;\n  width: 100%;\n  min-height: ${s.height}px;\n  overflow-x: hidden;\n  background: ${safeColor(s.background, '#ffffff')};\n}`);
    for (const el of renderableElements(s)) {
      parts.push(`.${cls(el)} {\n${cssToString({ ...boxCss(el, s), ...visualCss(el) })}\n}`);
      const hv = hoverCss(el);
      if (hv) parts.push(`.${cls(el)}:hover {\n${cssToString(hv)}\n}`);
    }
  }
  return parts.join('\n') + '\n';
}

function interactionAttrs(el: WDElement, files: Map<string, string>): string {
  const i = el.interaction;
  if (!i) return '';
  if (i.type === 'navigate' && files.has(i.screenId)) return ` data-navigate="${files.get(i.screenId)}"`;
  if (i.type === 'toggle') return ` data-toggle="${cls({ id: i.targetId } as WDElement)}"`;
  if (i.type === 'url') {
    const href = safeUrl(i.href);
    return href ? ` data-href="${escapeHtml(href)}"` : '';
  }
  return '';
}

export function buildScreenHtml(doc: WebDesignDoc, screen: WDScreen, files = screenFileNames(doc)): string {
  const body = renderableElements(screen)
    .map((el) => {
      const tag = rootTag(el);
      const classes = [cls(el), el.initiallyHidden ? 'is-hidden' : ''].filter(Boolean).join(' ');
      const type = tag === 'button' ? ' type="button"' : '';
      return `    <${tag} class="${classes}"${type} data-name="${escapeHtml(el.name)}"${interactionAttrs(el, files)}>${innerHtml(el, '    ')}</${tag}>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(screen.name)}</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="${screenCls(screen)}">
${body}
  </main>
  <script src="app.js"></script>
</body>
</html>
`;
}

export const APP_JS = `// Gerado pelo OmniDesign Studio: interações do protótipo.
document.addEventListener('click', function (event) {
  var target = event.target instanceof Element ? event.target.closest('[data-navigate],[data-toggle],[data-href]') : null;
  if (!target) return;
  var nav = target.getAttribute('data-navigate');
  var toggle = target.getAttribute('data-toggle');
  var href = target.getAttribute('data-href');
  if (nav) { window.location.href = nav; }
  else if (toggle) { document.querySelectorAll('.' + toggle).forEach(function (el) { el.classList.toggle('is-hidden'); }); }
  else if (href && /^(https?:|\\/|#)/i.test(href)) { window.open(href, '_blank', 'noopener'); }
});
`;

export function exportHtmlProject(doc: WebDesignDoc): FileMap {
  const files = screenFileNames(doc);
  const out: FileMap = { 'styles.css': buildCss(doc), 'app.js': APP_JS };
  for (const s of doc.screens) out[files.get(s.id)!] = buildScreenHtml(doc, s, files);
  return out;
}

import { escapeHtml, safeColor, safeUrl, slugify } from '@/core/utils/sanitize';
import { cssToString } from '../layout';
import type { WDElement, WDScreen, WebDesignDoc } from '../model';
import { innerHtml, rootTag } from './content';
import { buildRenderTree, keyframesCss, walk, type RenderNode } from './tree';

export type FileMap = Record<string, string>;

/** Font files available to the export: asset id -> { url relative to the stylesheet, format }. */
export interface ExportOptions {
  fonts?: Record<string, { url: string; format: string }>;
}

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

const clean = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');
export const cls = (el: Pick<WDElement, 'id'>) => `el-${clean(el.id)}`;
export const nodeCls = (n: RenderNode) => `el-${n.key}`;
export const screenCls = (s: WDScreen) => `screen-${clean(s.id)}`;

const STATE_SELECTOR = { hover: ':hover', pressed: ':active', focus: ':focus-within' } as const;

export function fontFaceCss(opts: ExportOptions): string {
  return Object.entries(opts.fonts ?? {})
    .map(([id, f]) => `@font-face {\n  font-family: 'omni-font-${clean(id)}';\n  src: url('${f.url.replace(/'/g, '')}') format('${f.format}');\n  font-display: swap;\n}`)
    .join('\n');
}

export function buildCss(doc: WebDesignDoc, opts: ExportOptions = {}): string {
  const parts: string[] = [
    '/* Gerado pelo OmniDesign Studio */',
    fontFaceCss(opts),
    '*, *::before, *::after { box-sizing: border-box; }',
    'html, body { margin: 0; padding: 0; }',
    '.is-hidden { display: none !important; }',
    '[data-navigate], [data-toggle], [data-href] { cursor: pointer; }',
    'button:disabled, input:disabled { cursor: not-allowed; }',
    keyframesCss(),
  ].filter(Boolean);
  const media = new Map<string, { width: number; minOrMax: 'min' | 'max'; rules: string[] }>();
  for (const s of doc.screens) {
    parts.push(`\n/* ${s.name.replace(/\*\//g, '')} */`);
    parts.push(`.${screenCls(s)} {\n  position: relative;\n  width: 100%;\n  min-height: ${s.height}px;\n  overflow-x: hidden;\n  background: ${safeColor(s.background, '#ffffff')};\n}`);
    walk(buildRenderTree(doc, s), (n) => {
      parts.push(`.${nodeCls(n)} {\n${cssToString(n.css)}\n}`);
      for (const [st, css] of Object.entries(n.states)) parts.push(`.${nodeCls(n)}${STATE_SELECTOR[st as keyof typeof STATE_SELECTOR]} {\n${cssToString(css!)}\n}`);
      for (const m of n.media) {
        const entry = media.get(m.query) ?? { width: m.width, minOrMax: m.minOrMax, rules: [] };
        entry.rules.push(`  .${nodeCls(n)} {\n${cssToString(m.css, '    ')}\n  }`);
        media.set(m.query, entry);
      }
    });
  }
  // Media queries go last, in cascade order (max-width descending, then min-width ascending).
  const ordered = [...media.entries()].sort(([, a], [, b]) =>
    a.minOrMax !== b.minOrMax ? (a.minOrMax === 'max' ? -1 : 1) : a.minOrMax === 'max' ? b.width - a.width : a.width - b.width,
  );
  for (const [q, m] of ordered) parts.push(`\n@media ${q} {\n${m.rules.join('\n')}\n}`);
  return parts.join('\n') + '\n';
}

function interactionAttrs(el: WDElement, files: Map<string, string>): string {
  const i = el.interaction;
  if (!i || el.disabled) return '';
  const anim = (t?: string, d?: number) => (t && t !== 'none' ? ` data-transition="${escapeHtml(t)}" data-duration="${Math.round(d ?? 300)}"` : '');
  if (i.type === 'navigate' && files.has(i.screenId)) return ` data-navigate="${files.get(i.screenId)}"${anim(i.transition, i.duration)}`;
  if (i.type === 'toggle') return ` data-toggle="${cls({ id: i.targetId })}"${anim(i.transition, i.duration)}`;
  if (i.type === 'url') {
    const href = safeUrl(i.href);
    return href ? ` data-href="${escapeHtml(href)}"` : '';
  }
  return '';
}

function nodeHtml(n: RenderNode, files: Map<string, string>, indent: string): string {
  const el = n.el;
  const tag = rootTag(el);
  const classes = [nodeCls(n), n.topLevel && el.initiallyHidden ? 'is-hidden' : ''].filter(Boolean).join(' ');
  const type = tag === 'button' ? ' type="button"' : '';
  const disabled = el.disabled && tag === 'button' ? ' disabled' : '';
  const inner = n.children.length
    ? `\n${n.children.map((c) => nodeHtml(c, files, `${indent}  `)).join('\n')}\n${indent}`
    : innerHtml(el, indent);
  return `${indent}<${tag} class="${classes}"${type}${disabled} data-name="${escapeHtml(el.name)}"${interactionAttrs(el, files)}>${inner}</${tag}>`;
}

export function buildScreenHtml(doc: WebDesignDoc, screen: WDScreen, files = screenFileNames(doc)): string {
  const body = buildRenderTree(doc, screen)
    .map((n) => nodeHtml(n, files, '    '))
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

export const APP_JS = `// Gerado pelo OmniDesign Studio: interações e transições do protótipo.
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function animate(el, t, d) {
    if (!t || t === 'none' || reduce) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = 'omni-' + t + ' ' + (parseInt(d, 10) || 300) + 'ms ease both';
  }
  // Transition requested by the previous page.
  try {
    var pending = JSON.parse(sessionStorage.getItem('omni-transition') || 'null');
    sessionStorage.removeItem('omni-transition');
    var main = document.querySelector('main');
    if (pending && main) animate(main, pending.t, pending.d);
  } catch (e) {}
  document.addEventListener('click', function (event) {
    var target = event.target instanceof Element ? event.target.closest('[data-navigate],[data-toggle],[data-href]') : null;
    if (!target) return;
    var nav = target.getAttribute('data-navigate');
    var toggle = target.getAttribute('data-toggle');
    var href = target.getAttribute('data-href');
    var t = target.getAttribute('data-transition');
    var d = target.getAttribute('data-duration');
    if (nav) {
      try { if (t) sessionStorage.setItem('omni-transition', JSON.stringify({ t: t, d: d })); } catch (e) {}
      window.location.href = nav;
    } else if (toggle) {
      document.querySelectorAll('.' + toggle).forEach(function (el) {
        var show = el.classList.contains('is-hidden');
        el.classList.toggle('is-hidden');
        if (show) animate(el, t, d);
      });
    } else if (href && /^(https?:|\\/|#)/i.test(href)) {
      window.open(href, '_blank', 'noopener');
    }
  });
})();
`;

export function exportHtmlProject(doc: WebDesignDoc, opts: ExportOptions = {}): FileMap {
  const files = screenFileNames(doc);
  const out: FileMap = { 'styles.css': buildCss(doc, opts), 'app.js': APP_JS };
  for (const s of doc.screens) out[files.get(s.id)!] = buildScreenHtml(doc, s, files);
  return out;
}

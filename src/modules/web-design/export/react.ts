import { safeColor, safeUrl, toComponentName } from '@/core/utils/sanitize';
import { cssToReact, type CssMap } from '../layout';
import type { WDElement, WDScreen, WebDesignDoc } from '../model';
import { innerJsx, rootTag } from './content';
import { buildCss, fontFaceCss, nodeCls, screenCls, type ExportOptions, type FileMap } from './html';
import { animationValue, buildRenderTree, keyframesCss, type RenderNode } from './tree';

export interface ReactExportOptions extends ExportOptions {
  /** Use Tailwind utility classes instead of a generated stylesheet. */
  tailwind: boolean;
}

/** Map a CSS map to Tailwind classes using arbitrary properties (works for every property). */
export function cssToTailwind(css: CssMap, variant = ''): string[] {
  const known: Record<string, Record<string, string>> = {
    position: { absolute: 'absolute', relative: 'relative' },
    display: { flex: 'flex', block: 'block', none: 'hidden' },
    'flex-direction': { column: 'flex-col' },
    'align-items': { center: 'items-center' },
    'justify-content': { center: 'justify-center', 'space-between': 'justify-between', 'flex-start': 'justify-start', 'flex-end': 'justify-end' },
    'text-align': { left: 'text-left', center: 'text-center', right: 'text-right' },
    'box-sizing': { 'border-box': 'box-border' },
    overflow: { hidden: 'overflow-hidden' },
    cursor: { pointer: 'cursor-pointer' },
    'user-select': { none: 'select-none' },
    'white-space': { 'pre-wrap': 'whitespace-pre-wrap' },
  };
  return Object.entries(css).map(([k, v]) => {
    const k2 = known[k]?.[v];
    if (k2) return variant + k2;
    // Arbitrary property: spaces become underscores, per Tailwind syntax.
    return `${variant}[${k}:${v.replace(/_/g, '\\_').replace(/\s+/g, '_')}]`;
  });
}

const TW_STATE = { hover: 'hover:', pressed: 'active:', focus: 'focus-within:' } as const;

export function nodeTailwind(n: RenderNode): string[] {
  const out = cssToTailwind(n.css);
  for (const [st, css] of Object.entries(n.states)) out.push(...cssToTailwind(css!, TW_STATE[st as keyof typeof TW_STATE]));
  for (const m of n.media) out.push(...cssToTailwind(m.css, `${m.minOrMax}-[${m.width}px]:`));
  return out;
}

function interactionProp(el: WDElement, screenNames: Map<string, string>): string {
  const i = el.interaction;
  if (!i || el.disabled) return '';
  if (i.type === 'navigate' && screenNames.has(i.screenId))
    return ` onClick={() => onNavigate(${JSON.stringify(screenNames.get(i.screenId))}, ${JSON.stringify(animationValue(i.transition, i.duration))})}`;
  if (i.type === 'toggle') return ` onClick={() => onToggle(${JSON.stringify(i.targetId)}, ${JSON.stringify(animationValue(i.transition, i.duration))})}`;
  if (i.type === 'url') {
    const href = safeUrl(i.href);
    return href ? ` onClick={() => window.open(${JSON.stringify(href)}, '_blank', 'noopener')}` : '';
  }
  return '';
}

export function componentNames(doc: WebDesignDoc): Map<string, string> {
  const used = new Set<string>(['App']);
  const map = new Map<string, string>();
  doc.screens.forEach((s, i) => {
    const base = toComponentName(s.name, `Screen${i + 1}`);
    let name = base;
    let n = 2;
    while (used.has(name)) name = `${base}${n++}`;
    used.add(name);
    map.set(s.id, name);
  });
  return map;
}

const tpl = (s: string) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

function nodeJsx(n: RenderNode, names: Map<string, string>, opts: ReactExportOptions, indent: string): string {
  const el = n.el;
  const tag = rootTag(el);
  const typeAttr = tag === 'button' ? ' type="button"' : '';
  const disabled = el.disabled && tag === 'button' ? ' disabled' : '';
  let classAttr: string;
  let styleAttr = '';
  if (n.topLevel) {
    const id = JSON.stringify(el.id);
    const hiddenCls = opts.tailwind ? ' hidden!' : ' is-hidden';
    const base = opts.tailwind ? nodeTailwind(n).join(' ') : nodeCls(n);
    classAttr = ` className={\`${tpl(base)}\${hidden.has(${id}) ? '${hiddenCls}' : ''}\`}`;
    styleAttr = ` style={anim[${id}] ? { animation: anim[${id}] } : undefined}`;
  } else {
    classAttr = ` className=${JSON.stringify(opts.tailwind ? nodeTailwind(n).join(' ') : nodeCls(n))}`;
  }
  const inner = n.children.length
    ? `\n${n.children.map((c) => nodeJsx(c, names, opts, `${indent}  `)).join('\n')}\n${indent}`
    : innerJsx(el, indent);
  return `${indent}<${tag}${classAttr}${styleAttr}${typeAttr}${disabled} data-name=${JSON.stringify(el.name)}${interactionProp(el, names)}>${inner}</${tag}>`;
}

export function buildScreenComponent(doc: WebDesignDoc, screen: WDScreen, names: Map<string, string>, opts: ReactExportOptions): string {
  const name = names.get(screen.id)!;
  const lines = buildRenderTree(doc, screen).map((n) => nodeJsx(n, names, opts, '      '));
  const screenStyle = opts.tailwind
    ? ` className="relative w-full overflow-x-hidden" style={${JSON.stringify(cssToReact({ 'min-height': `${screen.height}px`, background: safeColor(screen.background, '#ffffff') }))}}`
    : ` className="${screenCls(screen)}"`;
  return `// Gerado pelo OmniDesign Studio
export interface ScreenProps {
  hidden: Set<string>;
  /** Running entry animations of toggled elements, by element id. */
  anim: Record<string, string>;
  onNavigate: (screen: string, animation: string | null) => void;
  onToggle: (elementId: string, animation: string | null) => void;
}

export default function ${name}({ hidden, anim, onNavigate, onToggle }: ScreenProps) {
  void onNavigate;
  void onToggle;
  return (
    <main${screenStyle}>
${lines.join('\n')}
    </main>
  );
}
`;
}

export function buildApp(doc: WebDesignDoc, names: Map<string, string>, opts: ReactExportOptions): string {
  const imports = doc.screens.map((s) => `import ${names.get(s.id)} from './screens/${names.get(s.id)}';`).join('\n');
  const initialHidden = doc.screens.flatMap((s) => s.elements.filter((e) => e.initiallyHidden).map((e) => e.id));
  const map = doc.screens.map((s) => `  ${names.get(s.id)},`).join('\n');
  return `// Gerado pelo OmniDesign Studio
import { useState } from 'react';
${imports}
${opts.tailwind ? "import './index.css';" : "import './styles.css';"}

const screens = {
${map}
};

type ScreenName = keyof typeof screens;
const initialHidden: string[] = ${JSON.stringify(initialHidden)};
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function App() {
  const [current, setCurrent] = useState<ScreenName>(${JSON.stringify(names.get(doc.screens[0].id))});
  const [hidden, setHidden] = useState(() => new Set(initialHidden));
  const [anim, setAnim] = useState<Record<string, string>>({});
  const [screenAnim, setScreenAnim] = useState<string | null>(null);
  const [visit, setVisit] = useState(0);
  const Screen = screens[current];
  const toggle = (id: string, animation: string | null) => {
    const show = hidden.has(id);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnim((prev) => {
      const next = { ...prev };
      if (show && animation && !reduceMotion) next[id] = animation;
      else delete next[id];
      return next;
    });
  };
  const navigate = (screen: string, animation: string | null) => {
    if (screen in screens) {
      setCurrent(screen as ScreenName);
      setHidden(new Set(initialHidden));
      setAnim({});
      setScreenAnim(reduceMotion ? null : animation);
      setVisit((v) => v + 1);
      window.scrollTo(0, 0);
    }
  };
  return (
    <div key={visit} style={screenAnim ? { animation: screenAnim } : undefined}>
      <Screen hidden={hidden} anim={anim} onNavigate={navigate} onToggle={toggle} />
    </div>
  );
}
`;
}

export function exportReactProject(doc: WebDesignDoc, opts: ReactExportOptions, projectName = 'omnidesign-export'): FileMap {
  const names = componentNames(doc);
  const pkgName = projectName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'omnidesign-export';
  const deps: Record<string, string> = { react: '^19.1.0', 'react-dom': '^19.1.0' };
  const devDeps: Record<string, string> = {
    '@types/react': '^19.1.6',
    '@types/react-dom': '^19.1.6',
    '@vitejs/plugin-react': '^4.5.2',
    typescript: '^5.8.3',
    vite: '^6.3.5',
  };
  if (opts.tailwind) Object.assign(devDeps, { tailwindcss: '^4.1.10', '@tailwindcss/vite': '^4.1.10' });
  const files: FileMap = {
    'package.json': JSON.stringify(
      { name: pkgName, private: true, version: '0.1.0', type: 'module', scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' }, dependencies: deps, devDependencies: devDeps },
      null,
      2,
    ) + '\n',
    'index.html': `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName.replace(/[<>&]/g, '')}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'vite.config.ts': opts.tailwind
      ? `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport tailwindcss from '@tailwindcss/vite';\n\nexport default defineConfig({ plugins: [react(), tailwindcss()] });\n`
      : `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`,
    'tsconfig.json': JSON.stringify(
      { compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, isolatedModules: true }, include: ['src'] },
      null,
      2,
    ) + '\n',
    'src/main.tsx': `import { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`,
    'src/App.tsx': buildApp(doc, names, opts),
    'README.md': `# ${projectName}\n\nProjeto exportado pelo OmniDesign Studio.\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n`,
  };
  if (opts.tailwind)
    files['src/index.css'] = `@import "tailwindcss";\n\n${fontFaceCss(opts)}\nhtml, body { margin: 0; padding: 0; }\n${keyframesCss()}\n`;
  else files['src/styles.css'] = buildCss(doc, opts);
  for (const s of doc.screens) files[`src/screens/${names.get(s.id)}.tsx`] = buildScreenComponent(doc, s, names, opts);
  return files;
}

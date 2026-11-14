import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { boxCss } from '../layout';
import { createElement, createEmptyDoc, createScreen } from '../model';
import { buildCss, exportHtmlProject } from './html';
import { cssToTailwind, exportReactProject } from './react';
import { zipFiles } from './zip';

function sampleDoc() {
  const doc = createEmptyDoc(1000, 600);
  const home = doc.screens[0];
  home.name = 'Início';
  const about = createScreen('Sobre nós', 1000, 600);
  const modal = createElement('modal', 300, 200, { name: 'M' });
  home.elements.push(
    createElement('text', 10, 10, { text: '<script>alert(1)</script>' }),
    createElement('button', 10, 60, { text: 'Ir', interaction: { type: 'navigate', screenId: about.id } }),
    createElement('button', 10, 120, { text: 'Abrir', interaction: { type: 'toggle', targetId: modal.id } }),
    createElement('image', 10, 200, { src: 'javascript:alert(1)' }),
    modal,
  );
  doc.screens.push(about);
  return { doc, about, modal };
}

describe('layout constraints', () => {
  const screen = { width: 1000, height: 600 };
  it('produces CSS for each constraint', () => {
    const el = createElement('frame', 100, 50, { w: 200, h: 100 });
    expect(boxCss({ ...el, constraintH: 'left' }, screen)).toMatchObject({ left: '100px', width: '200px' });
    expect(boxCss({ ...el, constraintH: 'right' }, screen)).toMatchObject({ right: '700px', width: '200px' });
    expect(boxCss({ ...el, constraintH: 'stretch' }, screen)).toMatchObject({ left: '100px', right: '700px' });
    expect(boxCss({ ...el, constraintH: 'center' }, screen).left).toBe('calc(50% + -400px)');
    expect(boxCss({ ...el, constraintH: 'scale' }, screen)).toMatchObject({ left: '10%', width: '20%' });
    expect(boxCss({ ...el, constraintV: 'bottom' }, screen)).toMatchObject({ bottom: '450px', height: '100px' });
  });
});

describe('HTML export', () => {
  it('creates one page per screen, escapes text and blocks unsafe URLs', () => {
    const { doc, modal } = sampleDoc();
    const files = exportHtmlProject(doc);
    expect(Object.keys(files).sort()).toEqual(['app.js', 'index.html', 'sobre-nos.html', 'styles.css']);
    const index = files['index.html'];
    expect(index).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(index).not.toContain('<script>alert(1)');
    expect(index).not.toContain('javascript:');
    expect(index).toContain('data-navigate="sobre-nos.html"');
    expect(index).toContain(`data-toggle="el-${modal.id}"`);
    expect(index).toMatch(new RegExp(`class="el-${modal.id} is-hidden"`));
    expect(buildCss(doc)).toContain('.is-hidden { display: none !important; }');
  });
});

describe('React export', () => {
  it('generates a Vite project with one component per screen', () => {
    const { doc } = sampleDoc();
    const files = exportReactProject(doc, { tailwind: false }, 'Meu App');
    expect(files['src/screens/Inicio.tsx']).toContain('export default function Inicio');
    expect(files['src/screens/SobreNos.tsx']).toBeDefined();
    expect(files['src/screens/Inicio.tsx']).toContain('onNavigate("SobreNos", null)');
    expect(JSON.parse(files['package.json']).name).toBe('meu-app');
    expect(files['src/styles.css']).toBeDefined();
  });

  it('generates Tailwind classes using arbitrary properties', () => {
    expect(cssToTailwind({ position: 'absolute', left: '10px', 'box-shadow': '0px 4px 16px 0px rgba(0,0,0,0.1)' })).toEqual([
      'absolute',
      '[left:10px]',
      '[box-shadow:0px_4px_16px_0px_rgba(0,0,0,0.1)]',
    ]);
    const { doc } = sampleDoc();
    const files = exportReactProject(doc, { tailwind: true });
    expect(files['src/index.css']).toContain('@import "tailwindcss"');
    expect(files['src/screens/Inicio.tsx']).toContain('hover:[background-color:');
    expect(files['vite.config.ts']).toContain('@tailwindcss/vite');
  });
});

describe('ZIP export', () => {
  it('packs all files', async () => {
    const files = exportHtmlProject(sampleDoc().doc);
    const blob = await zipFiles(files, 'site');
    const zip = await JSZip.loadAsync(blob);
    expect(Object.keys(zip.files).filter((f) => !f.endsWith('/')).sort()).toEqual(['site/app.js', 'site/index.html', 'site/sobre-nos.html', 'site/styles.css']);
  });
});

describe('export of advanced features', () => {
  async function advancedDoc() {
    const { loadIcons } = await import('../icons');
    await loadIcons();
    const { createComponentFromSelection } = await import('../ops');
    const doc = createEmptyDoc(1200, 800);
    const s = doc.screens[0];
    const other = createScreen('Destino', 1200, 800);
    doc.screens.push(other);
    const btn = createElement('button', 10, 10, {
      text: 'Ir',
      rotation: 15,
      pressed: { fill: '#111111' },
      focus: { textColor: '#00ff00' },
      interaction: { type: 'navigate', screenId: other.id, transition: 'slide-left', duration: 400 },
      overrides: { 'bp-mobile': { x: 5, y: 5, w: 100, h: 40, fontSize: 12 }, 'bp-tablet': { visible: false } },
    });
    const off = createElement('button', 10, 80, { text: 'Off', disabled: true, interaction: { type: 'navigate', screenId: other.id } });
    const icon = createElement('icon', 200, 10, { iconName: 'House' });
    const font = createElement('text', 10, 200, { style: { fontFamily: "'omni-font-ast_abc', system-ui, sans-serif" } as never });
    const cardA = createElement('frame', 400, 400, { w: 100, h: 60 });
    const cardB = createElement('text', 410, 410, { w: 80, h: 20, text: 'Mestre' });
    s.elements.push(btn, off, icon, font, cardA, cardB);
    const r = createComponentFromSelection(doc, s.id, [cardA.id, cardB.id], 'Cartão');
    const d = r.doc;
    const textId = d.components[0].elements[1].id;
    d.screens[0].elements = d.screens[0].elements.map((e) => (e.id === r.instanceId ? { ...e, textOverrides: { [textId]: 'Sobrescrito' } } : e));
    return { doc: d, btn, off, instId: r.instanceId! };
  }

  it('HTML/CSS: rotation, states, disabled, icons, media queries, instances, transitions and fonts', async () => {
    const { doc, btn, instId } = await advancedDoc();
    const files = exportHtmlProject(doc, { fonts: { ast_abc: { url: './assets/f.woff2', format: 'woff2' } } });
    const css = files['styles.css'];
    expect(css).toContain('transform: rotate(15deg)');
    expect(css).toContain(`.el-${btn.id}:active {`);
    expect(css).toContain(`.el-${btn.id}:focus-within {`);
    expect(css).toMatch(/@font-face \{\n  font-family: 'omni-font-ast_abc';\n  src: url\('\.\/assets\/f\.woff2'\) format\('woff2'\)/);
    expect(css).toContain('@keyframes omni-slide-left');
    // Media queries come after base rules, max-width descending.
    const tab = css.indexOf('@media (max-width: 1023px)');
    const mob = css.indexOf('@media (max-width: 639px)');
    expect(tab).toBeGreaterThan(css.indexOf(`.el-${btn.id} {`));
    expect(mob).toBeGreaterThan(tab);
    expect(css.slice(mob)).toMatch(/left: 5px;[\s\S]*right: auto;[\s\S]*font-size: 12px;/);
    expect(css.slice(tab, mob)).toContain('display: none;');
    const html = files['index.html'];
    expect(html).toContain('data-transition="slide-left" data-duration="400"');
    expect(html).toMatch(/<button class="el-[^"]+" type="button" disabled data-name="Botão"><\/button>|type="button" disabled/);
    expect(html).not.toMatch(/disabled[^>]*data-navigate/);
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"');
    expect(html).toContain(`class="el-${instId}"`);
    expect(html).toContain('Sobrescrito');
    expect(html).not.toContain('Mestre');
    expect(files['app.js']).toContain('omni-transition');
  });

  it('React/Tailwind: variants, nested instances and animations', async () => {
    const { doc } = await advancedDoc();
    const tw = exportReactProject(doc, { tailwind: true, fonts: { ast_abc: { url: '/assets/f.woff2', format: 'woff2' } } });
    const screen = tw['src/screens/Inicio.tsx'] ?? tw[Object.keys(tw).find((k) => k.startsWith('src/screens/'))!];
    expect(screen).toContain('active:[background-color:#111111]');
    expect(screen).toContain('focus-within:[color:#00ff00]');
    expect(screen).toContain('max-[639px]:[left:5px]');
    expect(screen).toContain('max-[1023px]:hidden');
    expect(screen).toContain('strokeWidth="2"');
    expect(screen).toContain('Sobrescrito');
    expect(screen).toContain('"omni-slide-left 400ms ease both"');
    expect(tw['src/index.css']).toContain("font-family: 'omni-font-ast_abc'");
    expect(tw['src/App.tsx']).toContain('screenAnim');
  });
});

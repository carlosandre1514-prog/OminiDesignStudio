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
    expect(files['src/screens/Inicio.tsx']).toContain('onNavigate("SobreNos")');
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

// E2E for the 3D Design Studio. Requires the built app served at BASE_URL (default http://localhost:4173).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS_DIR;
const errors = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Falhou: ${msg}`);
  console.log(`✓ ${msg}`);
};
const until = async (fn, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await fn()) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const pagesNoise = (t) => !!process.env.PAGES_SIM && /status of 404/.test(t);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !pagesNoise(m.text()) && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

/** Average colour of a region of the WebGL canvas (forces a fresh frame first). */
const sample = (x, y, r = 6) =>
  page.evaluate(([x, y, r]) => {
    const c = document.querySelector('[data-testid="viewport-wrap"] canvas');
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0);
    const k = c.width / c.clientWidth;
    const d = g.getImageData(Math.round(x * k) - r, Math.round(y * k) - r, r * 2, r * 2).data;
    let s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) s[j] += d[i + j];
    return s.map((v) => v / (d.length / 4));
  }, [x, y, r]);
const props = () => page.getByTestId('inspector-3d');
const numField = (section, label) => props().locator('div', { has: page.locator(`span.label:text-is("${section}")`) }).locator('label', { has: page.locator(`span:text-is("${label}")`) }).locator('input').first();
const setNum = async (section, label, v) => {
  const f = numField(section, label);
  await f.fill(String(v));
  await f.press('Enter');
};

// ---- create a 3D project
await page.goto(BASE);
await page.getByRole('button', { name: '+ Novo projeto' }).click();
await page.getByRole('dialog').getByLabel('Nome').fill('Cena E2E');
await page.getByRole('dialog').getByLabel('Categoria').selectOption('3d');
await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await page.waitForURL(/3d-studio/);
await page.getByTestId('outliner').getByText('Cubo').waitFor();
await page.waitForTimeout(1500);
const box = await page.getByTestId('viewport-wrap').boundingBox();
const center = { x: box.width / 2, y: box.height / 2 };
// A point on the cube's front face, away from the transform gizmo drawn at its centre.
const face = { x: center.x - 60, y: center.y + 60 };
const bg = await sample(20, 20);
const cube0 = await sample(face.x, face.y);
assert(Math.abs(cube0[0] - bg[0]) + Math.abs(cube0[1] - bg[1]) > 40, `viewport renderiza a cena (cubo ${cube0.map(Math.round)} × fundo ${bg.map(Math.round)})`);

// ---- material colour changes the rendered pixels
await page.getByTestId('outliner').getByText('Cubo').click();
const colorText = props().locator('div.flex.items-center.gap-2:has(> span:text-is("Cor base")) > input:not([type=color])');
await colorText.fill('#ff0000');
await colorText.press('Enter');
assert(await until(async () => { const c = await sample(face.x, face.y); return c[0] > c[1] * 2 && c[0] > 80; }), 'cor do material aplicada no render (PBR)');

// ---- transform through the inspector
await setNum('Posição', 'X', 2);
assert(await until(async () => { const c = await sample(face.x, face.y); return !(c[0] > c[1] * 2); }), 'mover o objeto tira o cubo do centro da vista');
await page.keyboard.press('Control+z');
assert(await until(async () => { const c = await sample(face.x, face.y); return c[0] > c[1] * 2; }), 'desfazer devolve o cubo à posição');

// ---- shadows: toggling them changes the ground next to the cube
await page.keyboard.press('Escape');
await page.getByTestId('outliner').getByText('Sol').click();
await page.keyboard.press('Escape');
const shadowSpot = { x: center.x + box.width * 0.114, y: center.y + box.height * 0.065 }; // where the sun's shadow falls (measured)
const withShadow = await sample(shadowSpot.x, shadowSpot.y, 10);
await props().getByText('Sombras ativadas').click();
await page.waitForTimeout(800);
const noShadow = await sample(shadowSpot.x, shadowSpot.y, 10);
await props().getByText('Sombras ativadas').click();
assert(noShadow[0] + noShadow[1] + noShadow[2] > withShadow[0] + withShadow[1] + withShadow[2] + 6, `sombras renderizadas (chão ${withShadow.map(Math.round)} com sombra × ${noShadow.map(Math.round)} sem)`);

// ---- add primitives and a light
await page.getByTestId('outliner').locator('..').locator('..').getByRole('button', { name: 'Adicionar Esfera' }).click().catch(async () => page.getByTitle('Adicionar Esfera').click());
await page.getByTestId('outliner').getByText('Esfera').waitFor();
await page.getByLabel('Adicionar luz').selectOption('point');
await page.getByTestId('outliner').getByText('Luz pontual').waitFor();
assert(true, 'adiciona esfera e luz pontual');

// ---- edit mode: inset + subdivide change the real mesh
await page.getByTestId('outliner').getByText('Cubo').click();
await page.keyboard.press('Tab');
await page.getByText('Modo edição').first().waitFor();
const statsLine = () => props().locator('p', { hasText: 'vértices ·' }).first().textContent();
assert((await statsLine()).startsWith('8 vértices · 12 arestas · 6 faces'), `malha editável do cubo (${(await statsLine()).split('—')[0].trim()})`);
await page.keyboard.press('a');
await props().getByRole('button', { name: 'Inset' }).click();
assert(await until(async () => (await statsLine()).includes('30 faces')), `inset em todas as faces (${(await statsLine()).split('—')[0].trim()})`);
await props().getByRole('button', { name: 'Extrudar' }).click();
// The 6 inner faces stay selected after the inset: extruding them adds 4 walls each (30 + 24).
assert(await until(async () => (await statsLine()).includes('54 faces')), `extrusão das faces internas (${(await statsLine()).split('—')[0].trim()})`);
const afterExtrude = (await statsLine()).split('—')[0].trim();
await props().getByRole('button', { name: 'Subdividir', exact: true }).click();
assert(await until(async () => (await statsLine()).split('—')[0].trim() !== afterExtrude), `subdivisão Catmull–Clark (${(await statsLine()).split('—')[0].trim()})`);
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
await page.keyboard.press('Control+z');
assert(await until(async () => (await statsLine()).startsWith('8 vértices')), 'desfazer volta à malha original');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio3d-edit.png` });
await page.keyboard.press('Tab');

// ---- modifiers (non-destructive subdivision)
await page.getByTestId('outliner').getByText('Cubo').click();
await props().getByLabel('Níveis de subdivisão').selectOption('2');
await props().getByLabel('Sombreamento').selectOption('smooth');
assert((await props().getByText(/vértices · .* faces/).first().textContent()).startsWith('8 vértices'), 'modificador de subdivisão não altera a malha base (8 vértices)');
assert((await props().getByRole('button', { name: 'Aplicar modificadores na malha' }).count()) === 1, 'opção de aplicar o modificador disponível');

// ---- export GLB, STL, OBJ
const exportAs = async (label) => {
  await page.getByRole('button', { name: 'Exportar', exact: true }).click();
  await page.getByRole('dialog').getByText(label, { exact: true }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`Exportar ${label}`) }).click();
  const d = await dl;
  return { name: d.suggestedFilename(), path: await d.path() };
};
const fs = await import('node:fs');
const glb = await exportAs('GLB');
const glbBytes = fs.readFileSync(glb.path);
assert(glb.name === 'cena-e2e.glb' && glbBytes.subarray(0, 4).toString() === 'glTF', `GLB exportado (${glbBytes.length} bytes, cabeçalho glTF)`);
const json = JSON.parse(glbBytes.subarray(20, 20 + glbBytes.readUInt32LE(12)).toString());
assert(json.meshes.length >= 3 && json.materials.some((m) => m.name === 'Material padrão'), `GLB contém ${json.meshes.length} malhas e materiais`);
const stl = await exportAs('STL');
assert(fs.readFileSync(stl.path).readUInt32LE(80) > 100, 'STL exportado com triângulos');
const obj = await exportAs('OBJ');
assert(/^v /m.test(fs.readFileSync(obj.path, 'utf8')), 'OBJ exportado');
const png = await exportAs('PNG');
assert(fs.readFileSync(png.path).subarray(1, 4).toString() === 'PNG', 'PNG da vista exportado');

// ---- re-import the GLB through the library
await page.getByRole('button', { name: 'Importar modelo 3D…' }).click();
await page.getByTestId('picker-input').setInputFiles({ name: 'mesa.glb', mimeType: 'model/gltf-binary', buffer: glbBytes });
assert(await until(async () => (await page.getByTestId('outliner').getByText('mesa').count()) === 1, 15000), 'GLB reimportado aparece na cena');

// ---- showcase
await page.getByRole('button', { name: 'Apresentar' }).click();
await page.getByRole('dialog', { name: 'Apresentação 3D' }).waitFor();
await page.keyboard.press('Escape');
assert(await until(async () => (await page.getByRole('dialog', { name: 'Apresentação 3D' }).count()) === 0), 'modo apresentação abre e fecha');

// ---- persistence
await page.waitForTimeout(1500);
await page.reload();
await page.getByTestId('outliner').getByText('Esfera').waitFor({ timeout: 15000 });
assert((await page.getByTestId('outliner').getByText('mesa').count()) === 1, 'cena persiste após recarregar');

// ---- library thumbnail for the imported model
await page.goto(`${BASE}/assets`);
await page.getByLabel('Tipo').selectOption('model3d');
assert(await until(async () => (await page.getByTestId('asset-card').locator('img').count()) >= 1, 10000), 'miniatura 3D gerada na Asset Library');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/studio3d-library.png` });

await browser.close();
assert(errors.length === 0, `sem erros no console ${errors.length ? JSON.stringify(errors.slice(0, 5)) : ''}`);
console.log('\nE2E 3D OK');

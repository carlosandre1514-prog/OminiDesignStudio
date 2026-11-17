// E2E for 3D painting: 3D Studio → "Pintar em 3D" → paint on the model → apply back → Godot 4 export.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const JSZip = require('jszip');

const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const errors = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Falhou: ${msg}`);
  console.log(`✓ ${msg}`);
};
const until = async (fn, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try {
      if (await fn()) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !(process.env.PAGES_SIM && /status of 404/.test(m.text())) && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

/** Count reddish pixels in a WebGL canvas. */
const reds = (sel) =>
  page.evaluate((s) => {
    const c = document.querySelector(`${s} canvas`);
    const t = document.createElement('canvas');
    t.width = 200;
    t.height = 140;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0, 200, 140);
    const d = g.getImageData(0, 0, 200, 140).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 90 && d[i] > d[i + 1] * 1.8 && d[i] > d[i + 2] * 1.8) n++;
    return n;
  }, sel);

// ---- a 3D scene with a cube
await page.goto(`${BASE}/`);
await page.getByRole('button', { name: '+ Novo projeto' }).click();
await page.getByRole('dialog').getByLabel('Nome').fill('Pintura E2E');
await page.getByRole('dialog').getByLabel('Categoria').selectOption('3d');
await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await page.waitForURL(/3d-studio/);
await page.getByTestId('outliner').getByText('Cubo').click();
await page.waitForTimeout(800);

// ---- open the painting tool on the selected cube
await page.getByTestId('paint-3d').click();
await page.waitForURL(/texture-studio/);
assert(await until(async () => (await page.getByTestId('paint-model-info').count()) > 0, 60000), 'Pintar em 3D abre o Estúdio de Texturas com o modelo (UV automática + leitura da malha)');
const info = await page.getByTestId('paint-model-info').innerText();
assert(/12 triângulos/.test(info) && /6 ilhas/.test(info), `cubo com atlas UV de 6 ilhas (${info})`);
await page.waitForTimeout(2500);
const before = await reds('[data-testid="texture-preview-3d"]');

// ---- paint a red stroke across the cube (crosses UV islands)
const vp = await page.getByTestId('texture-preview-3d').boundingBox();
const cx = vp.x + vp.width / 2;
const cy = vp.y + vp.height / 2;
await page.mouse.move(cx - 90, cy);
await page.mouse.down();
for (let i = 0; i <= 24; i++) {
  await page.mouse.move(cx - 90 + i * 7.5, cy + Math.sin(i / 3) * 25);
  await page.waitForTimeout(25);
}
await page.mouse.up();
assert(await until(async () => (await reds('[data-testid="texture-preview-3d"]')) > before + 150), 'pincel 3D pinta o modelo');

// ---- brush tips
await page.getByRole('group', { name: 'Formato do pincel' }).getByRole('button', { name: 'Spray' }).click();
await page.mouse.move(cx - 40, cy + 60);
await page.mouse.down();
await page.mouse.move(cx + 40, cy + 60, { steps: 8 });
await page.mouse.up();
assert(true, 'pincel spray aplicado');

// ---- skin material keeps the target
await page.getByLabel('Material pronto').selectOption('skin-light');
assert(await until(async () => (await page.getByTestId('paint-model-info').count()) > 0), 'material de pele aplicado sem perder o modelo');
await page.getByRole('button', { name: 'Desfazer' }).click();

// ---- Godot 4 export
await page.getByTestId('tex-export').click();
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.getByTestId('tex-export-godot').click()]);
const zip = await JSZip.loadAsync(readFileSync(await dl.path()));
const names = Object.keys(zip.files);
const tres = names.find((n) => n.endsWith('.tres'));
assert(tres && names.some((n) => n.endsWith('.glb')) && names.some((n) => n.endsWith('_albedo.png')) && names.some((n) => n.endsWith('_normal.png')), `pacote Godot 4 com texturas, .tres e .glb (${names.length} arquivos)`);
const tresText = await zip.file(tres).async('string');
assert(/StandardMaterial3D/.test(tresText) && /albedo_texture = ExtResource/.test(tresText), 'material .tres válido para o Godot 4');

// ---- apply to the 3D Studio object
await page.getByTestId('tex-apply-model').click();
await page.waitForURL(/3d-studio/, { timeout: 180000 });
await page.getByTestId('outliner').getByText('Cubo').waitFor();
assert(await until(async () => (await reds('[data-testid="viewport-wrap"]')) > 40, 30000), 'pintura aplicada aparece no objeto do Estúdio 3D');
assert(await page.getByText(/Pintura 3D — Cubo/).count(), 'material "Pintura 3D — Cubo" criado no Estúdio 3D');

assert(errors.length === 0, `sem erros de página ${errors.join(' | ')}`);
await browser.close();
console.log('\nE2E Pintura 3D OK');

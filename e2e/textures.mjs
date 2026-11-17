// E2E for the Texture Studio (PC + phone). Requires the built app at BASE_URL.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const JSZip = require('jszip');

const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const SHOTS = process.env.SHOTS_DIR;
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
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pagesNoise = (t) => !!process.env.PAGES_SIM && /status of 404/.test(t);
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !pagesNoise(m.text()) && errors.push(`[${tag}] ${m.text()}`));
};
/** Signature of a canvas (3D: WebGL, 2D: map view). */
const snap = (page, sel) =>
  page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const t = document.createElement('canvas');
    t.width = 64;
    t.height = 64;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0, 64, 64);
    return Array.from(g.getImageData(0, 0, 64, 64).data).filter((_, i) => i % 4 !== 3);
  }, sel);
const diff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
const GL = '[data-testid="texture-preview-3d"] canvas';
const C2D = '[data-testid="texture-canvas-2d"]';

{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, 'pc');
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}/`);
  await page.getByTestId('new-texture').click();
  await page.waitForURL(/texture-studio/);
  await page.getByTestId('texture-studio').waitFor();
  assert(await until(async () => (await page.getByTestId('layers').locator('li').count()) === 4), 'novo projeto de textura abre com o material "Cerakote" (4 camadas)');
  await page.waitForTimeout(2500);
  const s0 = await snap(page, GL);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-cerakote.png` });

  // Smart material
  await page.getByLabel('Material pronto').selectOption('rusty');
  assert(await until(async () => diff(s0, await snap(page, GL)) > 6, 25000), 'material pronto "Aço enferrujado" muda a prévia 3D');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-rust.png` });
  await page.getByRole('button', { name: 'Desfazer' }).click();
  assert(await until(async () => (await page.getByTestId('layers').locator('li').count()) === 4), 'desfazer volta às camadas anteriores');

  // Add a pattern layer and edit generator parameters
  await page.getByTestId('add-layer').click();
  await page.getByRole('menuitem', { name: 'Padrão procedural' }).click();
  assert((await page.getByTestId('layers').locator('li').count()) === 5, 'camada de padrão adicionada');
  await page.getByTestId('tex-props').getByLabel('Padrão').first().selectOption('hex');
  await page.waitForTimeout(2500);
  const s1 = await snap(page, GL);
  await page.getByTestId('tex-props').getByLabel('Escala').first().fill('20');
  await page.getByTestId('tex-props').getByLabel('Escala').first().dispatchEvent('pointerup');
  assert(await until(async () => diff(s1, await snap(page, GL)) > 1.5, 25000), 'parâmetro do gerador (hexágonos) altera a textura');

  // 2D maps
  await page.getByRole('button', { name: 'Mapas 2D' }).click();
  await page.locator(C2D).waitFor();
  await page.waitForTimeout(1500);
  const c0 = await snap(page, C2D);
  await page.getByTestId('texture-preview-2d').getByRole('button', { name: 'Normal', exact: true }).click();
  await page.waitForTimeout(500);
  const n0 = await snap(page, C2D);
  const blueish = n0.filter((_, i) => i % 3 === 2).reduce((s, v) => s + v, 0) / (n0.length / 3);
  assert(diff(c0, n0) > 10 && blueish > 180, 'vista 2D mostra o mapa normal (azulado)');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-normal.png` });
  await page.getByTestId('texture-preview-2d').getByRole('button', { name: 'Cor base', exact: true }).click();

  // Paint layer: brush strokes on the 2D view
  await page.getByTestId('add-layer').click();
  await page.getByRole('menuitem', { name: 'Pintura (pincel)' }).click();
  await page.waitForTimeout(1500);
  const p0 = await snap(page, C2D);
  const box = await page.locator(C2D).boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.03), box.y + box.height * (0.5 + Math.sin(i / 3) * 0.1));
  await page.mouse.up();
  await page.waitForTimeout(1500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-paint-dbg.png` });
  assert(await until(async () => diff(p0, await snap(page, C2D)) > 1.5), 'pincel pinta na vista 2D');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-paint.png` });

  // Text / decal layer
  await page.getByTestId('add-layer').click();
  await page.getByRole('menuitem', { name: 'Texto / decalque' }).click();
  await page.getByLabel('Texto do decalque').fill('OMNI ARMS 5.56');
  await page.waitForTimeout(2000);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-text.png` });
  assert((await page.getByTestId('layers').innerText()).includes('Gravação'), 'camada de texto/gravação criada');

  // Paint on the 3D model
  await page.getByRole('button', { name: 'Vista 3D' }).click();
  await page.getByRole('button', { name: /Selecionar camada Pintura/ }).click();
  await page.waitForTimeout(2000);
  const g0 = await snap(page, GL);
  const gb = await page.locator(GL).boundingBox();
  await page.mouse.move(gb.x + gb.width * 0.45, gb.y + gb.height * 0.4);
  await page.mouse.down();
  for (let i = 0; i <= 15; i++) await page.mouse.move(gb.x + gb.width * (0.45 + i * 0.008), gb.y + gb.height * (0.4 + i * 0.012));
  await page.mouse.up();
  assert(await until(async () => diff(g0, await snap(page, GL)) > 0.8), 'pincel pinta direto no modelo 3D');

  // Export ZIP
  await page.getByTestId('tex-export').click();
  await page.getByRole('button', { name: '512×512' }).click();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByTestId('tex-download-zip').click()]);
  const zip = await JSZip.loadAsync(readFileSync(await dl.path()));
  const names = Object.keys(zip.files);
  assert(names.some((n) => n.endsWith('_basecolor.png')) && names.some((n) => n.endsWith('_normal.png')) && names.some((n) => n.endsWith('_roughness.png')) && names.some((n) => n.endsWith('.omnitex.json')), `ZIP com mapas PBR (${names.length} arquivos)`);
  const png = await zip.file(names.find((n) => n.endsWith('_basecolor.png'))).async('uint8array');
  assert(png[1] === 0x50 && png.length > 20000, 'PNG de cor base válido');

  // Save to library
  await page.getByTestId('tex-export').click();
  await page.getByTestId('tex-save-library').click();
  assert(await until(async () => {
    const n = await page.evaluate(async () => {
      const open = indexedDB.open('omnidesign-studio');
      const dbh = await new Promise((r) => (open.onsuccess = () => r(open.result)));
      const q = dbh.transaction('assets').objectStore('assets').getAll();
      const all = await new Promise((r) => (q.onsuccess = () => r(q.result)));
      return all.filter((a) => (a.tags ?? []).includes('textura')).length;
    });
    return n >= 6;
  }, 60000), 'mapas salvos na Asset Library');

  // Persistence: reload keeps layers (incl. the painted mask)
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByTestId('texture-studio').waitFor();
  assert(await until(async () => (await page.getByTestId('layers').locator('li').count()) === 7), 'camadas persistem após recarregar');
  await ctx.close();
}

{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  watch(page, 'mobile');
  await page.goto(`${BASE}/`);
  await page.getByTestId('new-texture').tap();
  await page.waitForURL(/texture-studio/);
  await page.getByTestId('texture-studio').waitFor();
  await page.waitForTimeout(2500);
  await page.getByTestId('texture-studio').getByRole('button', { name: 'Camadas', exact: true }).tap();
  assert(await page.getByTestId('layers').isVisible(), 'celular: painel de camadas abre');
  await page.getByTestId('texture-studio').getByRole('button', { name: 'Camadas', exact: true }).tap();
  await page.getByTestId('texture-studio').getByRole('button', { name: 'Propriedades', exact: true }).tap();
  assert(await page.getByTestId('layer-props').isVisible(), 'celular: propriedades abrem');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/tex-mobile.png` });
  await ctx.close();
}

assert(errors.length === 0, `sem erros de página ${errors.join(' | ')}`);
await browser.close();
console.log('E2E Texturas OK');

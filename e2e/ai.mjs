// E2E for the on-device AI features (photo → 3D in the Arsenal, photo → PBR material in the Texture Studio).
// The real models are downloaded from Hugging Face by the user's browser; here requests to huggingface.co are
// answered with tiny ONNX stand-ins that have the same inputs/outputs, so the whole pipeline runs for real
// (ONNX Runtime Web, download + offline cache, pre/post-processing, meshing, texturing, export).
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
const SHOTS = process.env.SHOTS_DIR;
const errors = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Falhou: ${msg}`);
  console.log(`✓ ${msg}`);
};
const until = async (fn, timeout = 60000) => {
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
const STUB_SEG = readFileSync(new URL('./fixtures/u2netp-stub.onnx', import.meta.url));
const STUB_DEPTH = readFileSync(new URL('./fixtures/depth-stub.onnx', import.meta.url));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const hits = { seg: 0, depth: 0 };
await ctx.route('https://huggingface.co/**', (route) => {
  const url = route.request().url();
  if (/U-2-Netp/.test(url)) {
    hits.seg++;
    return route.fulfill({ status: 200, body: STUB_SEG, headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' } });
  }
  if (/depth-anything/.test(url)) {
    hits.depth++;
    return route.fulfill({ status: 200, body: STUB_DEPTH, headers: { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' } });
  }
  return route.abort();
});
const page = await ctx.newPage();
const pagesNoise = (t) => !!process.env.PAGES_SIM && /status of 404/.test(t);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !pagesNoise(m.text()) && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

/** A side-view "rifle" photo: olive body with shading and a darker magazine, on a light grey background. */
const photoPng = () =>
  page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 300;
    const g = c.getContext('2d');
    g.fillStyle = '#e9e9e6';
    g.fillRect(0, 0, 640, 300);
    const grad = g.createLinearGradient(0, 60, 0, 120);
    grad.addColorStop(0, '#6f7d3c');
    grad.addColorStop(1, '#3d4620');
    g.fillStyle = grad;
    g.fillRect(40, 70, 560, 48); // receiver + barrel
    g.fillRect(40, 60, 140, 90); // stock
    g.fillStyle = '#2b3015';
    g.beginPath();
    g.moveTo(300, 118); g.lineTo(350, 118); g.lineTo(365, 240); g.lineTo(318, 245); g.closePath(); g.fill(); // magazine
    g.fillRect(230, 118, 34, 80); // grip
    return c.toDataURL('image/png').split(',')[1];
  });

// ---------------------------------------------------------------- Arsenal: photo → 3D
await page.goto(`${BASE}/arsenal`);
await page.getByTestId('arsenal-root').waitFor();
const png = Buffer.from(await photoPng(), 'base64');
await page.getByTestId('arsenal-image-input').setInputFiles({ name: 'fuzil-foto.png', mimeType: 'image/png', buffer: png });
assert(await until(async () => (await page.getByTestId('arsenal-parts').innerText()).includes('Modelo da foto') && /Pronto/.test(await page.getByTestId('arsenal-status').innerText()), 120000), 'Foto → 3D: modelo gerado');
const und = await page.getByTestId('arsenal-understood').innerText();
assert(/Recorte: IA/.test(und) && /Profundidade: IA/.test(und), `Foto → 3D usou a IA no aparelho (recorte + profundidade) — ${und.replace(/\s+/g, ' ').slice(0, 120)}`);
assert(hits.seg === 1 && hits.depth === 1, `modelos baixados uma vez (${hits.seg}, ${hits.depth})`);
await page.waitForTimeout(2500);
const green = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="arsenal-viewport"] canvas');
  const t = document.createElement('canvas');
  t.width = 160;
  t.height = 100;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, 160, 100);
  const d = g.getImageData(0, 0, 160, 100).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 6 && d[i + 1] > d[i + 2] + 10) n++;
  return n;
});
assert(green > 200, `a própria foto é a textura do modelo (${green} pixels oliva)`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-photo3d.png` });
const tris = Number((await page.getByTestId('arsenal-tris').innerText()).replace(/\D/g, ''));
assert(tris > 5000, `malha densa com relevo (${tris} triângulos)`);
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('arsenal-export-glb').click()]);
const glb = readFileSync(await dl.path());
assert(glb.subarray(0, 4).toString() === 'glTF' && glb.length > 100000, `GLB com textura da foto (${Math.round(glb.length / 1024)} KB)`);

// second photo: models come from the offline cache
await page.getByTestId('arsenal-image-input').setInputFiles({ name: 'fuzil-foto-2.png', mimeType: 'image/png', buffer: png });
assert(await until(async () => (await page.getByTestId('arsenal-understood').innerText()).includes('fuzil-foto-2') && /Pronto/.test(await page.getByTestId('arsenal-status').innerText()), 120000), 'segunda foto processada');
assert(hits.seg === 1 && hits.depth === 1, 'modelos reaproveitados do cache (sem novo download)');

// without AI
await page.getByRole('switch', { name: /IA no aparelho/ }).click();
await page.getByTestId('arsenal-image-input').setInputFiles({ name: 'sem-ia.png', mimeType: 'image/png', buffer: png });
assert(await until(async () => /sem IA/.test(await page.getByTestId('arsenal-understood').innerText()) && /Pronto/.test(await page.getByTestId('arsenal-status').innerText()), 60000), 'modo sem IA também gera o modelo');

// open in the 3D studio with the photo texture
await page.getByRole('switch', { name: /IA no aparelho/ }).click();
await page.getByTestId('arsenal-to-studio').click();
await page.waitForURL(/3d-studio/, { timeout: 120000 });
assert(await until(() => page.getByTestId('outliner').getByText('Modelo da foto').isVisible(), 30000) && (await page.getByTestId('outliner').innerText()).includes('Foto 3D'), 'modelo da foto aberto no Estúdio 3D');
await page.waitForTimeout(2500);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-studio.png` });

// ---------------------------------------------------------------- Texture Studio: photo → PBR material
await page.goto(`${BASE}/`);
await page.getByTestId('new-texture').click();
await page.waitForURL(/texture-studio/);
await page.getByTestId('texture-studio').waitFor();
await page.getByTestId('photo-material').click();
const surface = await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#5a3d2a';
  g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 64)
    for (let x = (y / 64) % 2 ? -48 : 0; x < 512; x += 96) {
      g.fillStyle = `rgb(${150 + ((x * 7 + y) % 40)}, ${70 + ((x + y * 3) % 25)}, 50)`;
      g.fillRect(x + 4, y + 4, 88, 56);
    }
  return c.toDataURL('image/png').split(',')[1];
});
await page.getByTestId('photo-material-input').setInputFiles({ name: 'tijolos.png', mimeType: 'image/png', buffer: Buffer.from(surface, 'base64') });
await page.getByTestId('photo-material-run').click();
assert(await until(async () => (await page.getByTestId('layers').innerText()).includes('Foto (cor + relevo)'), 120000), 'Foto → Material: camadas criadas');
await page.getByRole('button', { name: 'Mapas 2D' }).click();
await page.getByTestId('texture-preview-2d').getByRole('button', { name: 'Normal', exact: true }).click();
await page.waitForTimeout(3000);
const relief = await page.evaluate(() => {
  const c = document.querySelector('[data-testid="texture-canvas-2d"]');
  const t = document.createElement('canvas');
  t.width = 128;
  t.height = 128;
  const g = t.getContext('2d');
  g.drawImage(c, 0, 0, 128, 128);
  const d = g.getImageData(0, 0, 128, 128).data;
  let tilted = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 128) > 25 || Math.abs(d[i + 1] - 128) > 25) tilted++;
  return tilted;
});
assert(relief > 200, `mapa normal com relevo vindo da IA (${relief} pixels inclinados)`);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/ai-material.png` });

assert(errors.length === 0, `sem erros de página ${errors.join(' | ')}`);
await browser.close();
console.log('E2E IA OK');

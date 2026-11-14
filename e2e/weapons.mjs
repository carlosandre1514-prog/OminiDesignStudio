// E2E for the procedural weapon generator, on a phone-sized viewport. Requires the built app at BASE_URL.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS_DIR;
const errors = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Falhou: ${msg}`);
  console.log(`✓ ${msg}`);
};
const until = async (fn, timeout = 15000) => {
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
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const pagesNoise = (t) => !!process.env.PAGES_SIM && /status of 404/.test(t);
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !pagesNoise(m.text()) && errors.push(m.text()));

/** Pixel statistics of the preview canvas: how much of it differs from the background. */
const previewCoverage = () =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="weapon-preview"] canvas') ?? document.querySelector('[role="dialog"] canvas');
    const t = document.createElement('canvas');
    t.width = c.width;
    t.height = c.height;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0);
    const d = g.getImageData(0, 0, t.width, t.height).data;
    const bg = [d[0], d[1], d[2]];
    let diff = 0;
    let bright = 0;
    for (let i = 0; i < d.length; i += 16) {
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) diff++;
      if (d[i] + d[i + 1] + d[i + 2] > 450) bright++;
    }
    return { diff: diff / (d.length / 16), bright: bright / (d.length / 16) };
  });

await page.goto(BASE);
await page.getByRole('button', { name: '+ Novo projeto' }).click();
await page.getByRole('dialog').getByLabel('Nome').fill('Armas E2E');
await page.getByRole('dialog').getByLabel('Categoria').selectOption('3d');
await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await page.waitForURL(/3d-studio/);
await page.getByTestId('weapon-fab').click();
const dlg = page.getByRole('dialog', { name: 'Gerador de armas 3D' });
await dlg.waitFor();
assert(await until(async () => (await previewCoverage()).diff > 0.01), 'pré-visualização mostra a espada no celular');
const sword = await previewCoverage();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/weapon-sword.png` });

// Shape slider changes the model
const blade = dlg.getByLabel('Comprimento da lâmina');
await blade.fill('0.6');
assert(await until(async () => Math.abs((await previewCoverage()).diff - sword.diff) > 0.002), 'controle deslizante altera a forma');

// Every category and weapon type renders
for (const cat of ['Armas de fogo', 'Arco e flecha', 'Sci-fi / fantasia', 'Brancas / medievais']) {
  await dlg.getByRole('tab', { name: cat }).click();
  const types = await dlg.getByLabel('Tipo de arma').getByRole('button').allTextContents();
  for (const t of types) {
    await dlg.getByLabel('Tipo de arma').getByRole('button', { name: t, exact: true }).click();
    assert(await until(async () => (await previewCoverage()).diff > 0.005), `${cat} › ${t} renderiza`);
  }
}
await dlg.getByRole('tab', { name: 'Sci-fi / fantasia' }).click();
await dlg.getByLabel('Tipo de arma').getByRole('button', { name: 'Espada de energia', exact: true }).click();
assert(await until(async () => (await previewCoverage()).bright > 0.003), 'lâmina de energia brilha (emissivo)');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/weapon-energy.png` });

// Random variation + material choice, then add to the scene
await dlg.getByRole('tab', { name: 'Armas de fogo' }).click();
await dlg.getByLabel('Tipo de arma').getByRole('button', { name: 'Fuzil de assalto', exact: true }).click();
await dlg.getByTestId('weapon-random').click();
await dlg.getByLabel('Polímero').selectOption('areia');
await page.waitForTimeout(500);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/weapon-rifle.png` });
await dlg.getByTestId('weapon-add').click();
assert(await until(() => dlg.isHidden(), 30000), 'arma adicionada (texturas geradas e salvas)');

// Scene now has the group with editable parts and textured materials
await page.getByRole('button', { name: 'Hierarquia' }).click();
const outliner = page.getByTestId('outliner');
assert(await until(() => outliner.getByText('Fuzil de assalto').isVisible()), 'grupo da arma aparece na hierarquia');
const stats = await page.evaluate(async () => {
  const open = indexedDB.open('omnidesign-studio');
  const dbh = await new Promise((r) => (open.onsuccess = () => r(open.result)));
  const all = (store) => new Promise((r) => { const q = dbh.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); });
  const assets = await all('assets');
  return { textures: assets.filter((a) => (a.tags ?? []).includes('arma')).length };
});
assert(stats.textures >= 6, `texturas PBR salvas na Asset Library (${stats.textures})`);
await page.getByRole('button', { name: 'Hierarquia' }).click();
await page.waitForTimeout(800);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/weapon-scene.png` });

assert(errors.length === 0, `sem erros de página ${errors.join(' | ')}`);
await browser.close();
console.log('E2E armas OK');

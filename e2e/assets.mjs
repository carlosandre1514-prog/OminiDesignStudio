// E2E for the Asset Library (Fase 3). Requires the built app served at BASE_URL (default http://localhost:4173).
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const JSZip = require('jszip');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS_DIR;
const errors = [];
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Falhou: ${msg}`);
  console.log(`✓ ${msg}`);
};
const until = async (fn, timeout = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#7c5cff"/></svg>');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('Pasta E2E') : d.accept()));

await page.goto(`${BASE}/assets`);
await page.getByRole('heading', { name: 'Biblioteca de recursos' }).waitFor();

// Import: two valid files + one with mismatched content + one duplicate.
await page.getByTestId('asset-input').setInputFiles([
  { name: 'pixel.png', mimeType: 'image/png', buffer: PNG },
  { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: SVG },
  { name: 'falso.jpg', mimeType: 'image/jpeg', buffer: PNG },
]);
await until(async () => (await page.getByTestId('asset-card').count()) === 2);
assert((await page.getByTestId('asset-card').count()) === 2, 'importa arquivos válidos');
await page.getByText(/falso\.jpg: Conteúdo não corresponde/).waitFor();
assert(true, 'rejeita arquivo com conteúdo inválido');
await page.getByTestId('asset-input').setInputFiles([{ name: 'copia.png', mimeType: 'image/png', buffer: PNG }]);
await page.getByText(/já existiam na biblioteca/).waitFor();
assert((await page.getByTestId('asset-card').count()) === 2, 'deduplica conteúdo idêntico');

// Details: rename + tag, then filter by tag.
await page.getByTestId('asset-card').filter({ hasText: 'logo' }).click();
await page.getByLabel('Nome', { exact: true }).fill('Logotipo');
await page.getByLabel('Nome', { exact: true }).press('Enter');
await page.getByLabel('Tags (separadas por vírgula)').fill('marca, azul');
await page.getByLabel('Tags (separadas por vírgula)').press('Enter');
await page.getByRole('button', { name: '#marca' }).click();
await until(async () => (await page.getByTestId('asset-card').count()) === 1);
assert((await page.getByTestId('asset-card').first().textContent()).includes('Logotipo'), 'renomeia, adiciona tag e filtra por tag');
await page.getByRole('button', { name: '#marca' }).click();

// Folder + move via details.
await page.getByRole('button', { name: 'Nova pasta' }).click();
await page.getByRole('button', { name: '📁 Pasta E2E' }).waitFor();
await page.getByLabel('Pasta', { exact: true }).selectOption({ label: 'Pasta E2E' });
await page.getByRole('button', { name: '📁 Pasta E2E' }).click();
await until(async () => (await page.getByTestId('asset-card').count()) === 1);
assert((await page.getByTestId('asset-card').count()) === 1, 'cria pasta e move asset');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/library.png` });

// Web design: create project, insert image, pick the library asset.
await page.goto(BASE);
await page.getByRole('button', { name: '+ Novo projeto' }).click();
await page.getByRole('dialog').getByLabel('Nome').fill('Projeto Assets');
await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await page.getByTestId('wd-canvas').waitFor();
await page.getByTitle('Imagem', { exact: true }).click();
await page.getByRole('button', { name: 'Escolher da biblioteca…' }).click();
await page.getByRole('dialog').getByTitle('Logotipo').click();
await until(async () => (await page.locator('[data-testid="wd-canvas"] img[src^="blob:"]').count()) === 1);
assert((await page.locator('[data-testid="wd-canvas"] img[src^="blob:"]').count()) === 1, 'imagem da biblioteca aparece no canvas');

// Export: the asset is packaged with the code.
await page.getByRole('button', { name: 'Exportar', exact: true }).click();
await page.getByRole('dialog').getByRole('button', { name: /logotipo-.*\.svg/ }).waitFor();
const dl = page.waitForEvent('download');
await page.getByRole('button', { name: 'Baixar projeto (.zip)' }).click();
const zip = await JSZip.loadAsync(await (await dl).createReadStream().then((s) => new Promise((res) => { const c = []; s.on('data', (d) => c.push(d)); s.on('end', () => res(Buffer.concat(c))); })));
const names = Object.keys(zip.files);
const html = await zip.file(names.find((n) => n.endsWith('index.html'))).async('string');
assert(names.some((n) => /assets\/logotipo-.*\.svg$/.test(n)) && /src="\.\/assets\/logotipo-/.test(html), 'exportação HTML inclui o arquivo do asset');
await page.getByRole('button', { name: 'Fechar' }).click();

// Project module tab shows the linked asset.
await page.getByRole('button', { name: /Asset Library/ }).click();
await until(async () => (await page.getByTestId('asset-card').count()) === 1);
assert((await page.getByTestId('asset-card').count()) === 1, 'aba Asset Library do projeto mostra assets vinculados');

// Project package round trip.
await page.goto(`${BASE}/projects`);
const card = page.locator('.panel').filter({ hasText: 'Projeto Assets' }).first();
await card.getByLabel('Ações do projeto').click();
const dl2 = page.waitForEvent('download');
await page.getByRole('button', { name: 'Exportar pacote (.zip + assets)' }).click();
const pkgPath = await (await dl2).path();
const chooser = page.waitForEvent('filechooser');
await page.getByRole('button', { name: 'Importar…' }).click();
await (await chooser).setFiles(pkgPath);
await page.waitForURL(/\/project\/.+/);
await page.getByTestId('wd-canvas').waitFor();
await until(async () => (await page.locator('[data-testid="wd-canvas"] img[src^="blob:"]').count()) === 1);
assert((await page.locator('[data-testid="wd-canvas"] img[src^="blob:"]').count()) === 1, 'pacote do projeto reimportado com a imagem resolvida');

await browser.close();
assert(errors.length === 0, `sem erros no console ${errors.length ? JSON.stringify(errors) : ''}`);
console.log('\nE2E assets OK');

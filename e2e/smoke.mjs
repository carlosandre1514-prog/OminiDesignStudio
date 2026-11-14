// End-to-end smoke test for the built app. Usage: npm run build && npx vite preview --port 4173 & node e2e/smoke.mjs
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = process.env.SHOTS_DIR;
const errors = [];
const until = async (fn, timeout = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(`Falhou: ${msg}`);
  console.log(`✓ ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());

await page.goto(BASE);
await page.getByRole('heading', { name: 'Dashboard' }).waitFor();
assert(true, 'dashboard carrega');

// Create a project from the "Fluxo mobile" template.
await page.getByRole('button', { name: '+ Novo projeto' }).click();
await page.getByRole('dialog').getByRole('button', { name: /Fluxo mobile/ }).click();
await page.getByRole('dialog').getByLabel('Nome').fill('Projeto E2E');
await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await page.waitForURL(/\/project\/.+\/web-design/);
await page.getByTestId('wd-canvas').waitFor();
assert(true, 'projeto criado a partir de modelo e editor aberto');
assert(await page.getByText('Login', { exact: true }).count() > 0, 'telas do modelo listadas');

// Insert a button and check layers + properties.
await page.getByTitle('Botão', { exact: true }).click();
await page.locator('aside').getByText('Botão 2').waitFor();
assert(true, 'elemento inserido aparece nas camadas');
const xField = page.locator('label', { hasText: /^X/ }).locator('input').first();
const x0 = Number(await xField.inputValue());

// Drag the selected element on the canvas.
const handleBox = await page.locator('[data-handle="nw"]').boundingBox();
const start = { x: handleBox.x + 30, y: handleBox.y + 20 };
await page.mouse.move(start.x, start.y);
await page.mouse.down();
await page.mouse.move(start.x + 40, start.y + 40, { steps: 8 });
await page.mouse.up();
await until(async () => Number(await xField.inputValue()) !== x0);
const x1 = Number(await xField.inputValue());
assert(x1 !== x0, `arrastar move o elemento (x ${x0} → ${x1})`);

// Undo restores the position.
await page.keyboard.press('Control+z');
assert(await until(async () => Number(await xField.inputValue()) === x0), 'desfazer restaura a posição');
await page.keyboard.press('Control+Shift+z');
assert(await until(async () => Number(await xField.inputValue()) === x1), 'refazer reaplica');

// Edit text through the properties panel.
const textField = page.locator('label', { hasText: 'Texto' }).locator('textarea, input').first();
await textField.fill('Comprar');
await textField.press('Enter');
await page.waitForTimeout(1500); // autosave

if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor.png` });

// Prototype: click "Entrar" navigates to Home, card toggles modal.
await page.getByRole('button', { name: '▶ Protótipo' }).click();
const preview = page.getByTestId('preview-screen');
await preview.getByText('Entrar').click();
await preview.getByText('Card de exemplo').waitFor();
assert(true, 'protótipo navega entre telas');
assert(await preview.getByText('Detalhes').count() === 0, 'modal inicia oculto');
await preview.getByText('Card de exemplo').click();
await preview.getByText('Detalhes').waitFor();
assert(true, 'interação mostra modal');
await page.getByRole('dialog', { name: 'Pré-visualização do protótipo' }).getByLabel('Dispositivo').selectOption('tablet');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/preview.png` });
await page.keyboard.press('Escape');

// Export dialog shows generated code.
await page.getByRole('button', { name: 'Exportar', exact: true }).click();
await page.getByText('index.html').first().waitFor();
await page.getByRole('button', { name: 'React + TypeScript', exact: true }).click();
await page.getByText('src/App.tsx').waitFor();
assert(true, 'exportação gera arquivos HTML e React');
await page.getByRole('button', { name: 'Fechar' }).click();

// Reload: changes persisted locally.
await page.reload();
await page.getByTestId('wd-canvas').waitFor();
await page.locator('aside').getByText('Botão 2').click();
assert(await until(async () => (await page.locator('label', { hasText: 'Texto' }).locator('textarea, input').first().inputValue()) === 'Comprar'), 'alterações persistem após recarregar');

// Dashboard lists the project with a thumbnail.
await page.getByLabel('Voltar ao Dashboard').click();
await page.getByText('Projeto E2E').first().waitFor();
assert(true, 'projeto aparece no dashboard');

// Offline indicator.
await page.context().setOffline(true);
await page.getByText('Offline — modo local').first().waitFor();
assert(true, 'indicador offline');
await page.context().setOffline(false);

// Mobile layout renders without horizontal overflow.
await page.setViewportSize({ width: 390, height: 844 });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
assert(!overflow, 'dashboard sem rolagem horizontal no celular');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/mobile.png` });

await browser.close();
const real = errors.filter((e) => !/favicon/i.test(e));
assert(real.length === 0, `sem erros no console ${real.length ? JSON.stringify(real) : ''}`);
console.log('\nE2E OK');

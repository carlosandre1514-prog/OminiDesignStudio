// E2E for rotation, states, icons, breakpoints, components, transitions and library fonts.
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
const until = async (fn, timeout = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|decode|OTS|font/i.test(m.text()) && errors.push(m.text()));
page.on('dialog', (d) => (d.type() === 'prompt' ? d.accept('Cartão E2E') : d.accept()));

await page.goto(BASE);
await page.getByRole('button', { name: '+ Novo projeto' }).click();
await page.getByRole('dialog').getByLabel('Nome').fill('Avançado E2E');
await page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await page.getByTestId('wd-canvas').waitFor();
const props = page.locator('aside').last();
const field = (label) => props.locator('label', { has: page.locator(`span:text-is("${label}")`) }).locator('input').first();
const setNum = async (label, v) => {
  await field(label).fill(String(v));
  await field(label).press('Enter');
};

// Rotation through the properties panel.
await page.getByTitle('Botão', { exact: true }).click();
const btnId = await page.evaluate(() => [...document.querySelectorAll('[data-testid="wd-canvas"] [data-element-id]')].pop().dataset.elementId);
const btnSel = `[data-testid="wd-canvas"] [data-element-id="${btnId}"]`;
await setNum('R°', 30);
assert(await until(async () => (await page.locator(btnSel).getAttribute('style')).includes('rotate(30deg)')), 'rotação pelo painel');

// Rotation handle drag.
const rot = await page.locator('[data-handle="rot"]').boundingBox();
const box = await page.locator(btnSel).boundingBox();
await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width + 120, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
assert(await until(async () => Number(await field('R°').inputValue()) !== 30), `alça de rotação gira o elemento (${await field('R°').inputValue()}°)`);
await setNum('R°', 0);

// Pressed state + disabled.
await props.getByRole('button', { name: /^Pressionado/ }).click();
await props.getByLabel('Ativar estado pressed').check();
const pressedInput = props.locator('div.flex.items-center.gap-2:has(> span:text-is("Preench.")) > input:not([type=color])');
await pressedInput.fill('#ff0000');
await pressedInput.press('Enter');

// Icon from the icon library.
await page.getByTitle('Ícone', { exact: true }).click();
await props.getByRole('button', { name: 'Escolher ícone…' }).click();
await page.getByLabel('Pesquisar ícones').fill('house');
await page.getByRole('dialog').getByRole('button', { name: 'House', exact: true }).click();
assert(await until(async () => (await page.locator('[data-testid="wd-canvas"] svg path').count()) > 0), 'ícone da biblioteca renderizado no canvas');
await setNum('X', 900); // keep it away from the button

// Transition on the button: create a second screen and navigate with slide.
await page.locator(btnSel).click({ force: true });
await page.getByRole('button', { name: 'Nova tela' }).click();
await page.locator('aside').first().getByRole('button', { name: 'Tela 1', exact: true }).click();
await page.locator('aside').first().getByRole('button', { name: 'Botão', exact: true }).click();
await props.getByLabel('Tipo de interação').selectOption('navigate');
await props.getByLabel('Transição').selectOption('slide-left');

// Prototype: pressed style and transition.
await page.getByRole('button', { name: '▶ Protótipo' }).click();
const pv = page.getByTestId('preview-screen');
const pvBtn = pv.locator(`[data-element-id="${btnId}"]`);
const b2 = await pvBtn.boundingBox();
await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
await page.mouse.down();
const bg = () => pvBtn.evaluate((e) => getComputedStyle(e).backgroundColor);
assert(await until(async () => (await bg()) === 'rgb(255, 0, 0)', 2000), `estado pressionado aplicado (${await bg()})`);
await page.mouse.up();
assert(await until(async () => (await page.getByRole('dialog', { name: 'Pré-visualização do protótipo' }).getByLabel('Tela').inputValue()) !== '' && (await pv.locator(`[data-element-id="${btnId}"]`).count()) === 0, 2000), 'navegação ao soltar');
const animated = await page.evaluate(() => document.getAnimations().length);
assert(animated > 0, `transição animada na troca de tela (${animated} animação)`);
await page.keyboard.press('Escape');

// Disabled: no interaction.
await page.locator('aside').first().getByRole('button', { name: 'Tela 1', exact: true }).click();
await page.locator('aside').first().getByRole('button', { name: 'Botão', exact: true }).click();
await props.getByText('Desabilitado (sem interações').click();
await page.getByRole('button', { name: '▶ Protótipo' }).click();
await pv.locator(`[data-element-id="${btnId}"]`).click({ force: true });
await page.waitForTimeout(300);
assert((await pv.locator(`[data-element-id="${btnId}"]`).count()) === 1, 'botão desabilitado não navega');
await page.keyboard.press('Escape');
await props.getByText('Desabilitado (sem interações').click();

// Breakpoint override.
const baseX = Number(await field('X').inputValue());
await page.getByLabel('Breakpoint').selectOption({ label: 'Celular (≤639px)' });
await page.getByText('Editando o breakpoint').waitFor();
await setNum('X', 10);
await props.getByText('Ajustado neste breakpoint').waitFor();
await page.getByLabel('Breakpoint').selectOption({ label: 'Layout base' });
assert(await until(async () => Number(await field('X').inputValue()) === baseX), `base preservada (X=${baseX}) após ajuste no breakpoint`);
await page.getByRole('button', { name: '▶ Protótipo' }).click();
await page.getByRole('dialog', { name: 'Pré-visualização do protótipo' }).getByLabel('Dispositivo').selectOption('phone');
const left = await pv.locator(`[data-element-id="${btnId}"]`).evaluate((e) => e.style.left);
assert(left === '10px', `pré-visualização no celular usa o ajuste (${left})`);
await page.keyboard.press('Escape');

// Components: create from button + icon, then edit master and see instances update.
await page.keyboard.press('Control+a');
await props.getByRole('button', { name: /Criar componente/ }).click();
await page.getByTitle('Editar o componente mestre').waitFor();
assert((await page.locator('aside').first().getByText('Cartão E2E').count()) >= 1, 'componente criado a partir da seleção');
await page.keyboard.press('Control+d');
await until(async () => (await page.locator('[data-testid="wd-canvas"] [data-element-id] [data-element-id]').count()) >= 4);
assert((await page.locator('[data-testid="wd-canvas"] [data-element-id] [data-element-id]').count()) >= 4, 'duas instâncias renderizam o mestre');
await page.getByTitle('Editar o componente mestre').click();
await page.getByText('Componente: Cartão E2E').waitFor();
await page.locator('aside').first().getByRole('button', { name: 'Botão', exact: true }).click();
const txt = props.locator('label', { has: page.locator('span:text-is("Texto")') }).locator('input,textarea').first();
await txt.fill('Mestre alterado');
await txt.press('Enter');
await page.locator('aside').first().getByRole('button', { name: 'Tela 1', exact: true }).click();
assert(await until(async () => (await page.getByTestId('wd-canvas').getByText('Mestre alterado').count()) === 2), 'alteração no mestre aparece em todas as instâncias');

// Save component to the library.
await page.getByTitle('Editar o componente mestre').hover();
await page.getByTitle('Salvar na Asset Library').click();
await page.getByText(/salvo na biblioteca/).waitFor();
assert(true, 'componente salvo na biblioteca');

// Library font.
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60)]);
await page.locator('aside').first().getByRole('button', { name: 'Tela 1', exact: true }).click();
await page.getByTitle('Texto', { exact: true }).click();
await props.getByRole('button', { name: 'Aa…' }).click();
await page.getByTestId('picker-input').setInputFiles({ name: 'minha-fonte.woff2', mimeType: 'font/woff2', buffer: WOFF2 });
await until(async () => (await props.getByLabel('Fonte', { exact: true }).inputValue()).includes('omni-font-'));
assert((await props.getByLabel('Fonte', { exact: true }).inputValue()).includes('omni-font-'), 'fonte da biblioteca aplicada ao texto');
// Adjust the text at the phone breakpoint so the export has a media query.
await page.getByLabel('Breakpoint').selectOption({ label: 'Celular (≤639px)' });
await setNum('X', 20);
await page.getByLabel('Breakpoint').selectOption({ label: 'Layout base' });

// Export reflects everything.
await page.getByRole('button', { name: 'Exportar', exact: true }).click();
await page.getByRole('dialog').getByRole('button', { name: 'styles.css' }).click();
await until(async () => (await page.getByRole('dialog').locator('pre').textContent()).includes('@font-face'));
const css = await page.getByRole('dialog').locator('pre').textContent();
assert(css.includes('@media (max-width: 639px)') && css.includes('@font-face') && css.includes(':active') && css.includes('rotate(') === false, 'CSS exportado com breakpoint, fonte e estado pressionado');
if (SHOTS) await page.screenshot({ path: `${SHOTS}/advanced-export.png` });
await page.getByRole('button', { name: 'Fechar' }).click();

// Library page lists the component asset.
await page.goto(`${BASE}/assets`);
await page.getByLabel('Tipo').selectOption('component');
assert(await until(async () => (await page.getByTestId('asset-card').count()) === 1), 'componente aparece na Asset Library');

await browser.close();
assert(errors.length === 0, `sem erros no console ${errors.length ? JSON.stringify(errors) : ''}`);
console.log('\nE2E avançado OK');

// E2E for Arsenal 3D on the three profiles (PC, phone, Smart TV with D-pad). Requires the built app at BASE_URL.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const BASE = (process.env.BASE_URL ?? 'http://localhost:4173').replace(/\/$/, '');
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
const pagesNoise = (t) => !!process.env.PAGES_SIM && /status of 404/.test(t);
const watch = (page, tag) => {
  page.on('pageerror', (e) => errors.push(`[${tag}] ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !pagesNoise(m.text()) && errors.push(`[${tag}] ${m.text()}`));
};

/** Fingerprint of the WebGL canvas: coverage (non-background share) + coarse pixel signature. */
const snap = (page) =>
  page.evaluate(() => {
    const c = document.querySelector('[data-testid="arsenal-canvas"] canvas') ?? document.querySelector('[data-testid="arsenal-viewport"] canvas');
    const t = document.createElement('canvas');
    t.width = 192;
    t.height = 128;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0, 192, 128);
    const d = g.getImageData(0, 0, 192, 128).data;
    const bg = [d[0], d[1], d[2]];
    let cov = 0;
    const sig = [];
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) cov++;
      sig.push((d[i] + d[i + 1] + d[i + 2]) / 3);
    }
    return { cov: cov / (d.length / 4), sig };
  });
const changed = (a, b) => a.sig.filter((v, i) => Math.abs(v - b.sig[i]) > 6).length / a.sig.length;
const diff = (a, b) => a.sig.reduce((s, v, i) => s + Math.abs(v - b.sig[i]), 0) / a.sig.length;
const statusText = (page) => page.getByTestId('arsenal-status').innerText();
const tris = async (page) => Number((await page.getByTestId('arsenal-tris').innerText()).replace(/\D/g, ''));

// ================================================================ PC
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  watch(page, 'pc');
  page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}/`);
  await page.getByTestId('open-arsenal').click();
  await page.waitForURL(/arsenal/);
  assert((await page.getByTestId('arsenal-root').getAttribute('data-profile')) === 'pc', 'PC: layout de painéis laterais');
  assert(await until(async () => (await snap(page)).cov > 0.03), 'PC: viewport renderiza o fuzil com iluminação PBR');
  assert(await until(async () => /\d+ FPS/.test(await page.getByTestId('arsenal-fps').innerText()) && !/^0 FPS/.test((await page.getByTestId('arsenal-fps').innerText()).trim())), 'PC: contador de FPS ativo');
  assert(await until(async () => (await tris(page)) > 200), 'PC: contador de polígonos ativo');
  await page.getByRole('button', { name: 'Parar rotação' }).count().then(async (n) => n && page.getByRole('button', { name: 'Parar rotação' }).click());

  // ---- text-to-3D
  await page.getByTestId('arsenal-prompt').fill('Rifle de precisão .308 com luneta, bipé e supressor, camuflagem woodland, desgastado');
  await page.getByTestId('arsenal-generate').click();
  assert(await until(async () => (await page.getByTestId('arsenal-model-name').innerText()) === 'Rifle de precisão (HD)' && /Pronto/.test(await statusText(page))), 'PC: prompt gera rifle de precisão e status volta a "Pronto"');
  const und = await page.getByTestId('arsenal-understood').innerText();
  assert(/Bipé/.test(und) && /Supressor/.test(und) && /woodland/i.test(und), `PC: interpretação mostrada (${und.replace(/\s+/g, ' ').slice(0, 90)}…)`);
  await page.waitForTimeout(800);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/arsenal-pc.png` });

  // ---- example prompt (the one from the brief)
  await page.getByTestId('arsenal-prompt').fill('Fuzil de assalto tático cal. 5.56 com acabamento cerakote preto fosco e mira holográfica');
  await page.getByTestId('arsenal-generate').click();
  assert(await until(async () => (await page.getByTestId('arsenal-model-name').innerText()) === 'Fuzil AR-15 (HD)' && /Holográfica/.test(await page.getByTestId('arsenal-understood').innerText())), 'PC: prompt de exemplo → AR-15 HD com mira holográfica');
  assert(await until(async () => (await tris(page)) > 8000), `PC: modelo HD com alto detalhe (${await tris(page)} triângulos)`);
  await page.waitForTimeout(600);

  // ---- modular inspector
  const parts = page.getByTestId('arsenal-parts');
  const t0 = await tris(page);
  await parts.getByRole('button', { name: 'Ocultar Carregador' }).click();
  assert(await until(async () => (await tris(page)) < t0), 'PC: ocultar o carregador reduz os polígonos visíveis');
  await parts.getByRole('button', { name: 'Mostrar Carregador' }).click();
  await parts.getByRole('button', { name: 'Isolar Cano' }).click();
  assert(await until(async () => (await tris(page)) < t0 / 4), 'PC: isolar o cano mostra só ele');
  await parts.getByRole('button', { name: 'Isolar Cano' }).click();
  assert(await until(async () => (await tris(page)) === t0), 'PC: sair do isolamento restaura todas as peças');
  await page.waitForTimeout(500);
  const before = await snap(page);
  await page.getByLabel('Vista explodida (desmontagem)').fill('1');
  assert(await until(async () => diff(before, await snap(page)) > 2), 'PC: vista explodida separa as peças');
  await page.getByLabel('Vista explodida (desmontagem)').fill('0');
  await page.waitForTimeout(800);

  // ---- materials
  const m0 = await snap(page);
  await page.getByRole('group', { name: 'Camuflagem / Cerakote' }).getByRole('button', { name: 'Deserto' }).click();
  assert(await until(async () => diff(m0, await snap(page)) > 2), 'PC: camuflagem altera o material');
  const m1 = await snap(page);
  await page.getByLabel('Desgaste de bordas (Edge Wear)').fill('1');
  await page.getByLabel('Metálico (Metallic)').fill('0');
  assert(await until(async () => changed(m1, await snap(page)) > 0.004), 'PC: desgaste de bordas e metálico mudam o render');

  // ---- export
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('arsenal-export-glb').click()]);
  const glb = readFileSync(await dl.path());
  assert(glb.subarray(0, 4).toString() === 'glTF' && glb.length > 60000, `PC: GLB exportado com texturas (${Math.round(glb.length / 1024)} KB)`);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByTestId('arsenal-export-obj').click()]);
  const obj = readFileSync(await dl2.path(), 'utf8');
  assert(/^v /m.test(obj) && /^f /m.test(obj) && (obj.match(/^o /gm) ?? []).length > 5, 'PC: OBJ exportado com as sub-malhas');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.getByTestId('arsenal-export-gltf').click()]);
  const gltf = JSON.parse(readFileSync(await dl3.path(), 'utf8'));
  assert(gltf.meshes.length > 5 && gltf.materials.length >= 3 && gltf.images.length >= 3, `PC: GLTF com ${gltf.meshes.length} malhas, ${gltf.materials.length} materiais e ${gltf.images.length} texturas`);

  // ---- image-to-3D: a black pistol silhouette with a trigger-guard opening on white
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 260;
    const g = c.getContext('2d');
    g.fillStyle = '#fafafa';
    g.fillRect(0, 0, 400, 260);
    g.fillStyle = '#151515';
    g.fillRect(30, 30, 340, 60);
    g.beginPath();
    g.moveTo(50, 90); g.lineTo(130, 90); g.lineTo(115, 230); g.lineTo(40, 230); g.closePath(); g.fill();
    g.fillRect(130, 90, 90, 60);
    g.fillStyle = '#fafafa';
    g.fillRect(145, 90, 60, 45);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByRole('group', { name: 'Imagem → 3D' }).getByRole('button', { name: 'Silhueta extrudada' }).click();
  await page.getByTestId('arsenal-image-input').setInputFiles({ name: 'pistola.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  assert(await until(async () => (await parts.innerText()).includes('Corpo (silhueta)') && /Pronto/.test(await statusText(page))), 'PC: Imagem → 3D gera o sólido pela silhueta');
  assert(/Aberturas: 1/.test(await page.getByTestId('arsenal-understood').innerText()), 'PC: abertura do guarda-mato detectada na imagem');
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/arsenal-image.png` });

  // ---- open in the full 3D studio
  await page.getByRole('group', { name: 'Tipo' }).count(); // panel still there
  await page.getByRole('button', { name: 'Fuzil de assalto', exact: true }).click().catch(async () => {
    await page.getByRole('group', { name: 'Categoria' }).getByRole('button', { name: 'Armas de fogo' }).click();
    await page.getByRole('button', { name: 'Fuzil de assalto', exact: true }).click();
  });
  assert(await until(async () => (await page.getByTestId('arsenal-model-name').innerText()) === 'Fuzil de assalto'), 'PC: volta ao modelo procedural pelo seletor de tipo');
  // ---- Texture Studio material applied to the weapon
  await page.goto(`${BASE}/`);
  await page.getByTestId('new-texture').click();
  await page.waitForURL(/texture-studio/);
  await page.getByTestId('texture-studio').waitFor();
  await page.getByLabel('Material pronto').selectOption('woodland');
  assert(await until(async () => /Salvo/.test(await page.getByTestId('tex-status').innerText()), 20000), 'PC: textura camuflada criada e salva no Estúdio de Texturas');
  await page.goto(`${BASE}/arsenal`);
  assert(await until(async () => (await snap(page)).cov > 0.03), 'PC: Arsenal reabre com o AR-15 HD');
  await page.waitForTimeout(1500);
  const t0s = await snap(page);
  const slotGroup = page.getByRole('group', { name: 'Alumínio (receptores)' });
  await slotGroup.getByRole('button', { name: 'Nova textura' }).first().click();
  assert(await until(async () => changed(t0s, await snap(page)) > 0.02 && /Pronto/.test(await statusText(page)), 30000), 'PC: textura do Estúdio aplicada nos receptores');
  const green = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="arsenal-viewport"] canvas');
    const t = document.createElement('canvas');
    t.width = 128;
    t.height = 128;
    const g = t.getContext('2d');
    g.drawImage(c, 0, 0, 128, 128);
    const d = g.getImageData(0, 0, 128, 128).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 8 && d[i + 1] > d[i + 2] + 4) n++;
    return n;
  });
  assert(green > 40, `PC: camuflagem woodland visível na arma (${green} pixels verdes)`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/arsenal-studio-texture.png` });
  await page.getByTestId('arsenal-to-studio').click();
  const tStudio = Date.now();
  await page.waitForURL(/3d-studio/, { timeout: 120000 }).catch(async (e) => {
    console.log('toasts:', await page.locator('[role=status], [role=alert]').allInnerTexts());
    throw e;
  });
  console.log(`  (projeto criado em ${((Date.now() - tStudio) / 1000).toFixed(1)} s)`);
  assert(await until(() => page.getByTestId('outliner').getByText('Fuzil AR-15 (HD)').isVisible(), 30000), 'PC: "Abrir no Estúdio 3D" cria projeto com a arma editável (com as texturas do estúdio)');
  await ctx.close();
}

// ================================================================ Mobile
{
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  watch(page, 'mobile');
  await page.goto(`${BASE}/arsenal`);
  assert((await page.getByTestId('arsenal-root').getAttribute('data-profile')) === 'mobile', 'Celular: layout empilhado detectado');
  assert(await until(async () => (await snap(page)).cov > 0.03), 'Celular: viewport renderiza');
  const tabBox = await page.getByTestId('arsenal-tab-pecas').boundingBox();
  assert(tabBox.height >= 44, `Celular: abas com alvo de toque grande (${Math.round(tabBox.height)}px)`);
  await page.getByTestId('arsenal-generate').tap();
  assert(await until(async () => /Pronto/.test(await statusText(page)) && (await page.getByTestId('arsenal-understood').count()) > 0), 'Celular: gerar pelo prompt');
  await page.getByTestId('arsenal-tab-pecas').tap();
  assert(await page.getByTestId('arsenal-parts').isVisible(), 'Celular: aba de peças');
  // Drag to orbit (touch)
  const vp = await page.getByTestId('arsenal-viewport').boundingBox();
  await page.getByRole('button', { name: 'Parar rotação' }).count().then(async (n) => n && page.getByRole('button', { name: 'Parar rotação' }).tap());
  await page.waitForTimeout(400);
  const s0 = await snap(page);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', vp.x + vp.width / 2, vp.y + vp.height / 2);
  for (let i = 1; i <= 10; i++) await touch('touchMove', vp.x + vp.width / 2 + i * 15, vp.y + vp.height / 2);
  await touch('touchEnd');
  assert(await until(async () => diff(s0, await snap(page)) > 2), 'Celular: arrastar gira a câmera');
  await page.getByTestId('arsenal-tab-materiais').tap();
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/arsenal-mobile.png` });
  await ctx.close();
}

// ================================================================ Smart TV (D-pad)
{
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/85.0 TV Safari/537.36' });
  const page = await ctx.newPage();
  watch(page, 'tv');
  await page.goto(`${BASE}/arsenal`);
  assert((await page.getByTestId('arsenal-root').getAttribute('data-profile')) === 'tv', 'TV: perfil Smart TV detectado pelo user agent');
  assert(await until(async () => (await snap(page)).cov > 0.03), 'TV: viewport renderiza');
  const active = () => page.evaluate(() => {
    const a = document.activeElement;
    return { id: a?.getAttribute('data-testid') ?? '', role: a?.getAttribute('role') ?? '', label: a?.getAttribute('aria-label') ?? a?.textContent?.trim() ?? '', shadow: getComputedStyle(a).boxShadow, transform: getComputedStyle(a).scale, inPanel: !!a?.closest('[role=tabpanel]') };
  });
  assert(await until(async () => (await active()).id === 'arsenal-viewport'), 'TV: foco inicial no viewport');
  // Camera mode: OK, then arrows orbit
  await page.keyboard.press('Enter');
  assert(/modo câmera/.test((await active()).label), 'TV: OK entra no modo câmera');
  await page.waitForTimeout(400);
  const c0 = await snap(page);
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft');
  assert(await until(async () => diff(c0, await snap(page)) > 2), 'TV: setas giram a câmera');
  await page.keyboard.press('Enter');
  // Arrow right leaves the viewport towards the side panel
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300); // let the focus transition finish
  let a = await active();
  assert(a.role === 'tab' && /Gerar/.test(a.label), `TV: seta → leva o foco à aba selecionada (${a.label})`);
  assert(/34, 211, 238/.test(a.shadow), 'TV: foco com borda brilhante ciano');
  assert(a.transform !== 'none' && Number(String(a.transform).split(' ')[0]) > 1, `TV: foco com escala aumentada (${a.transform})`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert(await until(async () => (await page.getByTestId('arsenal-tab-materiais').getAttribute('aria-selected')) === 'true'), 'TV: ↓↓ + OK abre a aba Materiais');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  a = await active();
  assert(a.inPanel, `TV: seta → entra no painel (${a.label})`);
  // A slider takes ←/→ for its value
  for (let i = 0; i < 12 && (await active()).label !== 'Desgaste de bordas (Edge Wear)'; i++) await page.keyboard.press('ArrowDown');
  assert((await active()).label === 'Desgaste de bordas (Edge Wear)', 'TV: ↓ navega até o slider de desgaste');
  const v0 = await page.getByLabel('Desgaste de bordas (Edge Wear)').inputValue();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  assert(Number(await page.getByLabel('Desgaste de bordas (Edge Wear)').inputValue()) > Number(v0), 'TV: ←/→ ajustam o slider focado');
  // Back returns to the tab list
  await page.keyboard.press('Escape');
  assert((await active()).role === 'tab', 'TV: Voltar retorna às abas');
  // Enter on a camo option
  await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 12 && !/Woodland/.test((await active()).label); i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 8 && !/Woodland/.test((await active()).label); i++) await page.keyboard.press('ArrowRight');
  if (/Woodland/.test((await active()).label)) {
    await page.keyboard.press('Enter');
    assert(await page.getByRole('group', { name: 'Camuflagem / Cerakote' }).getByRole('button', { name: 'Woodland' }).getAttribute('aria-pressed') === 'true', 'TV: OK aplica a camuflagem focada');
  } else assert(false, `TV: alcançar a opção Woodland pelo D-pad (foco em ${(await active()).label})`);
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/arsenal-tv.png` });
  await ctx.close();
}

assert(errors.length === 0, `sem erros de página ${errors.join(' | ')}`);
await browser.close();
console.log('E2E Arsenal OK');

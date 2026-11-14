// E2E for login + cloud sync with two browser "devices" against a local stand-in of the Supabase API
// (e2e/fake-supabase.mjs). Requires the built app served at BASE_URL (default http://localhost:4173).
import { createRequire } from 'node:module';
import { startFakeSupabase } from './fake-supabase.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
// REAL mode: SUPABASE_URL + SUPABASE_ANON_KEY point at a real project; otherwise the local stand-in is used.
const REAL = !!process.env.SUPABASE_URL;
const supa = REAL
  ? { url: process.env.SUPABASE_URL, anonKey: process.env.SUPABASE_ANON_KEY, stats: () => null, close: async () => undefined }
  : await startFakeSupabase(54399);
const createdAccounts = [];
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
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
};

const browser = await chromium.launch();
async function newDevice(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { ctx, page };
}
const email = REAL ? `omni-e2e-${Date.now()}@mailinator.com` : `e2e${Date.now()}@example.com`;
createdAccounts.push(email);
const password = 'senha-super-forte-1';

// ---------------- Device A: create local work, then sign up ----------------
const A = await newDevice('A');
await A.page.goto(BASE);
await A.page.getByRole('button', { name: '+ Novo projeto' }).click();
await A.page.getByRole('dialog').getByLabel('Nome').fill('Projeto Nuvem');
await A.page.getByRole('dialog').getByRole('button', { name: 'Criar projeto' }).click();
await A.page.getByTestId('wd-canvas').waitFor();
await A.page.getByTitle('Botão', { exact: true }).click();
await A.page.waitForTimeout(1200); // autosave

await A.page.goto(`${BASE}/account`);
// Configure the connection through the UI; a secret key must be refused.
const secret = 'x.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.y';
await A.page.getByLabel('Project URL').fill(supa.url);
await A.page.getByLabel('Chave pública (anon / publishable)').fill(secret);
await A.page.getByRole('button', { name: 'Salvar configuração' }).click();
await A.page.getByText(/service_role \(secreta\)/).waitFor();
assert(true, 'chave secreta (service_role) recusada');
await A.page.getByLabel('Chave pública (anon / publishable)').fill(supa.anonKey);
await A.page.getByRole('button', { name: 'Salvar configuração' }).click();
await A.page.getByRole('button', { name: 'Criar conta' }).first().click();
await A.page.getByLabel('E-mail').fill(email);
await A.page.getByLabel('Senha', { exact: true }).fill(password);
await A.page.getByLabel('Confirmar senha').fill(password);
await A.page.getByRole('button', { name: 'Criar conta' }).last().click();
await A.page.getByText('Primeira sincronização desta conta').waitFor({ timeout: 15000 });
assert(true, 'cadastro e pedido de consentimento antes de enviar dados locais');
await A.page.getByRole('button', { name: 'Enviar e sincronizar' }).click();
assert(await until(async () => (await A.page.getByTestId('sync-status').textContent()) === 'Sincronizado' && (await A.page.getByTestId('sync-pending').textContent()) === '0'), 'dispositivo A sincronizado sem pendências');
assert((await A.page.getByTestId('sync-report').textContent()).includes('enviados'), `relatório: ${await A.page.getByTestId('sync-report').textContent()}`);

// ---------------- Device B: sign in, receive the project ----------------
const B = await newDevice('B');
await B.page.goto(`${BASE}/account`);
await B.page.getByLabel('Project URL').fill(supa.url);
await B.page.getByLabel('Chave pública (anon / publishable)').fill(supa.anonKey);
await B.page.getByRole('button', { name: 'Salvar configuração' }).click();
// Wrong password first.
await B.page.getByLabel('E-mail').fill(email);
await B.page.getByLabel('Senha', { exact: true }).fill('errada-123');
await B.page.getByRole('button', { name: 'Entrar' }).last().click();
await B.page.getByText('E-mail ou senha incorretos.').waitFor();
assert(true, 'senha errada mostra mensagem clara');
await B.page.getByLabel('E-mail').fill(email);
await B.page.getByLabel('Senha', { exact: true }).fill(password);
await B.page.getByRole('button', { name: 'Entrar' }).last().click();
assert(await until(async () => (await B.page.getByTestId('sync-status').textContent()) === 'Sincronizado'), 'dispositivo B entra sem pedido de consentimento (nada local)');
await B.page.goto(`${BASE}/projects`);
await B.page.getByText('Projeto Nuvem').first().waitFor();
assert(true, 'projeto criado em A aparece em B');

// Edit on B, A receives it (manual sync on both).
await B.page.getByText('Projeto Nuvem').first().click();
await B.page.getByTestId('wd-canvas').waitFor();
await B.page.locator('aside').first().getByRole('button', { name: 'Botão', exact: true }).click();
const txtB = B.page.locator('aside').last().locator('label', { has: B.page.locator('span:text-is("Texto")') }).locator('input,textarea').first();
await txtB.fill('Editado no B');
await txtB.press('Enter');
await B.page.waitForTimeout(1200);
await B.page.goto(`${BASE}/account`);
await B.page.getByRole('button', { name: 'Sincronizar agora' }).click();
assert(await until(async () => (await B.page.getByTestId('sync-pending').textContent()) === '0' && (await B.page.getByTestId('sync-status').textContent()) === 'Sincronizado'), 'edição do B enviada');

await A.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await until(async () => (await A.page.getByTestId('sync-report').textContent()).includes('1 recebidos'));
await A.page.goto(`${BASE}/projects`);
await A.page.getByText('Projeto Nuvem').first().click();
await A.page.getByTestId('wd-canvas').waitFor();
assert(await until(async () => (await A.page.getByTestId('wd-canvas').getByText('Editado no B').count()) === 1), 'edição feita no B chega ao A');

// Asset with binary content: A imports, B receives the file.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await A.page.goto(`${BASE}/assets`);
await A.page.getByTestId('asset-input').setInputFiles({ name: 'logo-nuvem.png', mimeType: 'image/png', buffer: PNG });
await A.page.getByTestId('asset-card').first().waitFor();
await A.page.goto(`${BASE}/account`);
await A.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await until(async () => (await A.page.getByTestId('sync-pending').textContent()) === '0' && (REAL || supa.stats().files === 1));
await B.page.goto(`${BASE}/account`);
await B.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await until(async () => (await B.page.getByTestId('sync-report').textContent()).includes('1 recebidos'));
await B.page.goto(`${BASE}/assets`);
assert(await until(async () => (await B.page.getByTestId('asset-card').filter({ hasText: 'logo-nuvem' }).count()) === 1), 'asset (com o arquivo) sincronizado de A para B');
await B.page.getByTestId('asset-card').first().click();
assert(await until(async () => (await B.page.locator('aside img[src^="blob:"]').count()) === 1), 'arquivo do asset baixado e exibido em B');

// Back to the project in A for the conflict scenario.
await A.page.goto(`${BASE}/projects`);
await A.page.getByText('Projeto Nuvem').first().click();
await A.page.getByTestId('wd-canvas').waitFor();

// ---------------- Conflict: both edit while B is offline ----------------
await A.page.locator('aside').first().getByRole('button', { name: 'Botão', exact: true }).click();
const txtA = A.page.locator('aside').last().locator('label', { has: A.page.locator('span:text-is("Texto")') }).locator('input,textarea').first();
await B.page.goto(`${BASE}/projects`);
await B.page.getByText('Projeto Nuvem').first().click();
await B.page.getByTestId('wd-canvas').waitFor();
await B.page.locator('aside').first().getByRole('button', { name: 'Botão', exact: true }).click();
await B.ctx.setOffline(true);
const txtB2 = B.page.locator('aside').last().locator('label', { has: B.page.locator('span:text-is("Texto")') }).locator('input,textarea').first();
await txtB2.fill('Versão offline do B');
await txtB2.press('Enter');
await B.page.waitForTimeout(1200);
await B.page.getByLabel('Voltar ao Dashboard').click(); // in-app navigation (no network needed)
assert(await until(async () => /Offline · [1-9]/.test(await B.page.getByTestId('sync-indicator').first().textContent())), 'B offline acumula alterações pendentes');

await txtA.fill('Versão do A');
await txtA.press('Enter');
await A.page.waitForTimeout(1200);
await A.page.goto(`${BASE}/account`);
await A.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await until(async () => (await A.page.getByTestId('sync-pending').textContent()) === '0');

await B.ctx.setOffline(false); // reconnecting triggers an automatic sync
await B.page.getByRole('link', { name: 'Conta e nuvem' }).first().click();
await B.page.getByText('Conflitos (1)').waitFor({ timeout: 20000 });
assert(true, 'edição concorrente detectada como conflito (sem sobrescrever)');
if (SHOTS) await B.page.screenshot({ path: `${SHOTS}/cloud-conflict.png` });
await B.page.getByRole('button', { name: 'Manter ambos' }).click();
assert(await until(async () => (await B.page.getByText('Conflitos (1)').count()) === 0), 'conflito resolvido mantendo ambos');
await B.page.goto(`${BASE}/projects`);
assert(await until(async () => (await B.page.getByText('Projeto Nuvem (cópia local)').count()) === 1), 'cópia local do B preservada');

// A receives the copy too (wait for B to finish uploading it, and for A's sync to finish before navigating).
await B.page.goto(`${BASE}/account`);
await until(async () => (await B.page.getByTestId('sync-pending').textContent()) === '0' && (await B.page.getByTestId('sync-status').textContent()) === 'Sincronizado', 30000);
await A.page.goto(`${BASE}/account`);
await until(async () => (await A.page.getByTestId('sync-status').textContent()) === 'Sincronizado', 30000);
await A.page.getByRole('button', { name: 'Sincronizar agora' }).click();
await until(async () => (await A.page.getByTestId('sync-status').textContent()) === 'Sincronizado' && /[1-9]\d* recebidos/.test(await A.page.getByTestId('sync-report').textContent()), 30000);
await A.page.goto(`${BASE}/projects`);
assert(await until(async () => (await A.page.getByText('Projeto Nuvem (cópia local)').count()) === 1), 'cópia criada em B chega ao A');

// Sign out keeps local data.
await A.page.goto(`${BASE}/account`);
await A.page.getByRole('button', { name: 'Sair' }).click();
await A.page.getByRole('button', { name: 'Entrar' }).first().waitFor();
await A.page.goto(`${BASE}/projects`);
assert(await until(async () => (await A.page.getByText('Projeto Nuvem').count()) >= 1), 'sair mantém os dados locais');

if (REAL) {
  // Isolation on the real project: a second account sees none of the first account's records or files.
  const h = { apikey: supa.anonKey, 'Content-Type': 'application/json' };
  const login = async (em, pw, signup) => (await (await fetch(`${supa.url}/auth/v1/${signup ? 'signup' : 'token?grant_type=password'}`, { method: 'POST', headers: h, body: JSON.stringify({ email: em, password: pw }) })).json());
  const a = await login(email, password, false);
  const mineA = await (await fetch(`${supa.url}/rest/v1/omni_records?select=kind,id,owner`, { headers: { ...h, Authorization: `Bearer ${a.access_token}` } })).json();
  assert(Array.isArray(mineA) && mineA.length >= 3 && mineA.every((r) => r.owner === a.user.id), `conta A vê os próprios ${mineA.length} registros na nuvem real`);
  const other = `omni-e2e-${Date.now()}-b@mailinator.com`;
  createdAccounts.push(other);
  const b = await login(other, password, true);
  const auth = { ...h, Authorization: `Bearer ${b.access_token}` };
  const seen = await (await fetch(`${supa.url}/rest/v1/omni_records?select=id`, { headers: auth })).json();
  assert(Array.isArray(seen) && seen.length === 0, 'outra conta não vê nenhum registro da conta A');
  const forged = await fetch(`${supa.url}/rest/v1/omni_records`, { method: 'POST', headers: auth, body: JSON.stringify({ owner: a.user.id, kind: 'project', id: 'invasao', revision: 1, hash: 'a'.repeat(64) }) });
  assert(forged.status === 403 || forged.status === 401, `outra conta não grava em nome da conta A (HTTP ${forged.status})`);
  const tamper = await fetch(`${supa.url}/rest/v1/omni_records?owner=eq.${a.user.id}`, { method: 'PATCH', headers: { ...auth, Prefer: 'return=representation' }, body: JSON.stringify({ deleted: true }) });
  assert((await tamper.json()).length === 0, 'outra conta não altera registros da conta A');
  const blob = mineA.find((r) => r.kind === 'asset');
  const assetRow = blob && (await (await fetch(`${supa.url}/rest/v1/omni_records?kind=eq.asset&select=payload`, { headers: { ...h, Authorization: `Bearer ${a.access_token}` } })).json())[0];
  const file = await fetch(`${supa.url}/storage/v1/object/omni-assets/${a.user.id}/blobs/${assetRow.payload.hash}`, { headers: auth });
  assert(file.status >= 400, `outra conta não baixa arquivos da conta A (HTTP ${file.status})`);
  const own = await fetch(`${supa.url}/storage/v1/object/omni-assets/${a.user.id}/blobs/${assetRow.payload.hash}`, { headers: { ...h, Authorization: `Bearer ${a.access_token}` } });
  assert(own.status === 200, 'a própria conta baixa o arquivo do asset');
  const del = await fetch(`${supa.url}/rest/v1/omni_records?id=eq.${mineA[0].id}`, { method: 'DELETE', headers: { ...h, Authorization: `Bearer ${a.access_token}` } });
  assert(del.status === 401 || del.status === 403, `nem o dono apaga registros fisicamente (HTTP ${del.status})`);
  console.log(`\nContas de teste criadas: ${createdAccounts.join(', ')}`);
} else {
  const st = supa.stats();
  assert(st.users === 1 && st.rows >= 3 && st.files === 1, `servidor recebeu os dados (${JSON.stringify(st)})`);
}
await browser.close();
await supa.close();
assert(errors.length === 0, `sem erros de página ${errors.length ? JSON.stringify(errors) : ''}`);
console.log('\nE2E nuvem OK');

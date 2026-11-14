import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validateCloudConfig } from './config';
import { hashPayload } from './kinds';
import { INLINE_LIMIT, SupabaseRemote } from './supabaseRemote';

type Result = { data?: unknown; error?: { message: string; code?: string; statusCode?: string } | null };

/** Records the query-builder chain and returns canned results in order. */
function fakeClient(results: Result[]) {
  const calls: string[][] = [];
  const next = () => results.shift() ?? { data: null, error: null };
  const builder = (chain: string[]): unknown =>
    new Proxy(
      {},
      {
        get(_t, prop: string) {
          if (prop === 'then') {
            calls.push(chain);
            const r = next();
            return (res: (v: unknown) => void) => res({ data: r.data ?? null, error: r.error ?? null });
          }
          return (...args: unknown[]) => {
            const c = [...chain, `${prop}(${args.map((a) => JSON.stringify(a)).join(',')})`];
            if (prop === 'maybeSingle') {
              calls.push(c);
              const r = next();
              return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
            }
            return builder(c);
          };
        },
      },
    );
  const storageOp = (name: string) => async (...args: unknown[]) => {
    calls.push([`storage.${name}`, JSON.stringify(args[0])]);
    const r = next();
    return { data: r.data ?? null, error: r.error ?? null };
  };
  const client = {
    from: (t: string) => builder([`from(${t})`]),
    storage: { from: () => ({ upload: storageOp('upload'), download: storageOp('download') }) },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const H = 'ab'.repeat(32);

describe('SupabaseRemote', () => {
  it('lists with owner/kind filters and paginates', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, revision: 1, hash: H, deleted: false, updated_at: 't' }));
    const { client, calls } = fakeClient([{ data: page }, { data: [{ id: 'last', revision: 2, hash: H, deleted: true, updated_at: 't' }] }]);
    const heads = await new SupabaseRemote(client, 'u1', 'd1').list('project');
    expect(heads).toHaveLength(1001);
    expect(heads[1000]).toEqual({ id: 'last', revision: 2, hash: H, deleted: true, updatedAt: 't' });
    expect(calls[0].join('.')).toContain('eq("owner","u1").eq("kind","project")');
    expect(calls[1].join('.')).toContain('range(1000,1999)');
  });

  it('maps insert duplicates and conditional update results', async () => {
    const { client, calls } = fakeClient([
      { error: null },
      { error: { message: 'duplicate key', code: '23505' } },
      { data: [{ revision: 3 }] },
      { data: [] },
      { error: { message: 'revision conflict', code: '40001' } },
    ]);
    const r = new SupabaseRemote(client, 'u1', 'd1');
    const w = { hash: H, payload: { a: 1 }, deleted: false };
    expect(await r.insert('asset', 'a1', w)).toBe('ok');
    expect(calls[0].join('.')).toContain('"revision":1');
    expect(await r.insert('asset', 'a1', w)).toBe('exists');
    expect(await r.update('asset', 'a1', 2, w)).toBe('ok');
    expect(calls[2].join('.')).toContain('"revision":3');
    expect(calls[2].join('.')).toContain('eq("revision",2)');
    expect(await r.update('asset', 'a1', 2, w)).toBe('conflict');
    expect(await r.update('asset', 'a1', 2, w)).toBe('conflict');
  });

  it('stores large payloads in Storage and reads them back with integrity check', async () => {
    const payload = { big: 'x'.repeat(INLINE_LIMIT + 10) };
    const hash = await hashPayload(payload);
    const json = JSON.stringify(payload);
    const { client, calls } = fakeClient([
      { error: null }, // upload payload
      { error: null }, // insert row
      { data: { id: 'p', revision: 1, hash, deleted: false, updated_at: 't', payload: null, payload_ref: `u1/payloads/${hash}.json` } },
      { data: new Blob([json]) },
    ]);
    const r = new SupabaseRemote(client, 'u1', 'd1');
    expect(await r.insert('project', 'p', { hash, payload, deleted: false })).toBe('ok');
    expect(calls[0]).toEqual(['storage.upload', JSON.stringify(`u1/payloads/${hash}.json`)]);
    expect(calls[1].join('.')).toContain(`"payload":null,"payload_ref":"u1/payloads/${hash}.json"`);
    const rec = await r.get('project', 'p');
    expect((rec?.payload as { big: string }).big.length).toBe(INLINE_LIMIT + 10);
  });

  it('rejects remote content that does not match its hash', async () => {
    const { client } = fakeClient([{ data: { id: 'p', revision: 1, hash: H, deleted: false, updated_at: 't', payload: { tampered: true } } }]);
    await expect(new SupabaseRemote(client, 'u1', 'd1').get('project', 'p')).rejects.toThrow(/não confere/);
  });

  it('treats existing blobs as uploaded, missing ones as null and verifies local bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const { sha256Hex } = await import('@/core/utils/binary');
    const h = await sha256Hex(bytes);
    const { client, calls } = fakeClient([
      { error: { message: 'The resource already exists', statusCode: '409' } },
      { error: { message: 'Object not found', statusCode: '404' } },
    ]);
    const r = new SupabaseRemote(client, 'u1', 'd1');
    await expect(r.uploadBlob(h, bytes, 'image/png')).resolves.toBeUndefined();
    expect(calls[0][1]).toBe(JSON.stringify(`u1/blobs/${h}`));
    await expect(r.downloadBlob(h)).resolves.toBeNull();
    await expect(r.uploadBlob(H, bytes, 'image/png')).rejects.toThrow(/não confere/);
  });

  it('surfaces other errors', async () => {
    const { client } = fakeClient([{ error: { message: 'JWT expired', code: 'PGRST301' } }]);
    await expect(new SupabaseRemote(client, 'u1', 'd1').list('folder')).rejects.toThrow(/JWT expired/);
  });
});

describe('cloud config validation', () => {
  const jwt = (payload: object) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.y`;
  it('accepts public keys and rejects secrets', () => {
    expect(validateCloudConfig('https://abc.supabase.co', jwt({ role: 'anon' }))).toEqual([]);
    expect(validateCloudConfig('https://abc.supabase.co', 'sb_publishable_123')).toEqual([]);
    expect(validateCloudConfig('https://abc.supabase.co', jwt({ role: 'service_role' })).join()).toMatch(/service_role/);
    expect(validateCloudConfig('https://abc.supabase.co', 'sb_secret_123').join()).toMatch(/secreta/);
    expect(validateCloudConfig('http://abc.supabase.co', 'sb_publishable_1').join()).toMatch(/https/);
    expect(validateCloudConfig('http://localhost:54321', 'sb_publishable_1')).toEqual([]);
    expect(validateCloudConfig('nada', '').length).toBe(2);
  });
});

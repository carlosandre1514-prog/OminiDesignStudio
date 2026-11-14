import type { SupabaseClient } from '@supabase/supabase-js';
import { blobToArrayBuffer, sha256Hex } from '@/core/utils/binary';
import { hashPayload } from './kinds';
import type { RemoteHead, RemoteRecord, RemoteStore, RemoteWrite, SyncKind } from './types';

export const TABLE = 'omni_records';
export const BUCKET = 'omni-assets';
const PAGE = 1000;
/** Payloads larger than this (serialized) go to Storage instead of the jsonb column. */
export const INLINE_LIMIT = 2_000_000;

interface Row {
  id: string;
  revision: number;
  hash: string;
  deleted: boolean;
  updated_at: string;
  payload?: unknown;
  payload_ref?: string | null;
}

type SbError = { message?: string; code?: string; statusCode?: string | number } | null;

const head = (r: Row): RemoteHead => ({ id: r.id, revision: r.revision, hash: r.hash, deleted: r.deleted, updatedAt: r.updated_at });
const text = (e: SbError) => `${e?.message ?? ''} ${e?.statusCode ?? ''}`;

function fail(what: string, error: SbError): never {
  throw new Error(`${what}: ${error?.message ?? 'erro desconhecido'}${error?.code ? ` (${error.code})` : ''}`);
}

/** RemoteStore backed by the "omni_records" table and the "omni-assets" bucket (see supabase/migrations). */
export class SupabaseRemote implements RemoteStore {
  constructor(
    private sb: SupabaseClient,
    readonly owner: string,
    private device: string,
  ) {}

  async list(kind: SyncKind): Promise<RemoteHead[]> {
    const out: RemoteHead[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await this.sb
        .from(TABLE)
        .select('id,revision,hash,deleted,updated_at')
        .eq('owner', this.owner)
        .eq('kind', kind)
        .order('id')
        .range(from, from + PAGE - 1);
      if (error) fail('Falha ao listar registros', error);
      out.push(...((data ?? []) as Row[]).map(head));
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async get(kind: SyncKind, id: string): Promise<RemoteRecord | null> {
    const { data, error } = await this.sb
      .from(TABLE)
      .select('id,revision,hash,deleted,updated_at,payload,payload_ref')
      .eq('owner', this.owner)
      .eq('kind', kind)
      .eq('id', id)
      .maybeSingle();
    if (error) fail('Falha ao ler registro', error);
    if (!data) return null;
    const row = data as Row;
    let payload: unknown = row.payload ?? null;
    if (!row.deleted && payload === null && row.payload_ref) {
      const { data: blob, error: e2 } = await this.sb.storage.from(BUCKET).download(row.payload_ref);
      if (e2 || !blob) fail('Falha ao baixar conteúdo do registro', e2);
      payload = JSON.parse(new TextDecoder().decode(await blobToArrayBuffer(blob)));
    }
    // Integrity: the content must match the hash stored with it.
    if (!row.deleted && payload !== null && (await hashPayload(payload)) !== row.hash) throw new Error(`Conteúdo de ${kind} ${id} na nuvem não confere com o hash`);
    return { ...head(row), payload };
  }

  /** Small payloads go inline (jsonb); large ones to Storage, content-addressed and immutable. */
  private async encode(rec: RemoteWrite): Promise<{ payload: unknown; payload_ref: string | null }> {
    if (rec.deleted || rec.payload === null || rec.payload === undefined) return { payload: null, payload_ref: null };
    const json = JSON.stringify(rec.payload);
    if (json.length <= INLINE_LIMIT) return { payload: rec.payload, payload_ref: null };
    const path = `${this.owner}/payloads/${rec.hash}.json`;
    await this.uploadIfMissing(path, new TextEncoder().encode(json), 'application/json');
    return { payload: null, payload_ref: path };
  }

  async insert(kind: SyncKind, id: string, rec: RemoteWrite): Promise<'ok' | 'exists'> {
    const enc = await this.encode(rec);
    const { error } = await this.sb.from(TABLE).insert({ owner: this.owner, kind, id, revision: 1, hash: rec.hash, deleted: rec.deleted, device: this.device, ...enc });
    if (!error) return 'ok';
    if (error.code === '23505') return 'exists';
    fail('Falha ao criar registro', error);
  }

  async update(kind: SyncKind, id: string, expected: number, rec: RemoteWrite): Promise<'ok' | 'conflict'> {
    const enc = await this.encode(rec);
    // Conditional write: only applies while the stored revision is still the expected one.
    const { data, error } = await this.sb
      .from(TABLE)
      .update({ revision: expected + 1, hash: rec.hash, deleted: rec.deleted, device: this.device, ...enc })
      .eq('owner', this.owner)
      .eq('kind', kind)
      .eq('id', id)
      .eq('revision', expected)
      .select('revision');
    if (error) {
      if (error.code === '40001') return 'conflict';
      fail('Falha ao atualizar registro', error);
    }
    return data && data.length ? 'ok' : 'conflict';
  }

  /** Raw bytes (not Blob/FormData) so the stored object is byte-for-byte the content that was hashed. */
  private async uploadIfMissing(path: string, body: Uint8Array, contentType: string): Promise<void> {
    const { error } = await this.sb.storage.from(BUCKET).upload(path, body, { upsert: false, contentType });
    // Content-addressed: "already exists" means the same bytes are already there.
    if (error && !/exists|duplicate|409/i.test(text(error))) fail('Falha ao enviar arquivo', error);
  }

  async uploadBlob(hash: string, data: ArrayBuffer, mime: string): Promise<void> {
    if ((await sha256Hex(data)) !== hash) throw new Error('Conteúdo local do asset não confere com o hash');
    await this.uploadIfMissing(`${this.owner}/blobs/${hash}`, new Uint8Array(data), mime || 'application/octet-stream');
  }

  async downloadBlob(hash: string): Promise<ArrayBuffer | null> {
    const { data, error } = await this.sb.storage.from(BUCKET).download(`${this.owner}/blobs/${hash}`);
    if (error) {
      if (/not.?found|404|400/i.test(text(error))) return null;
      fail('Falha ao baixar arquivo', error);
    }
    return data ? blobToArrayBuffer(data) : null;
  }
}

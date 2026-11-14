import type { RemoteHead, RemoteRecord, RemoteStore, RemoteWrite, SyncKind } from '@/core/cloud/types';

/** Shared in-memory "cloud" with the same rules as the SQL schema (revision +1, owner isolation). */
export class MemoryCloud {
  rows = new Map<string, RemoteRecord & { owner: string; kind: SyncKind }>();
  blobs = new Map<string, ArrayBuffer>();
  calls = 0;
  for(owner: string): RemoteStore {
    return new MemoryRemote(this, owner);
  }
}

class MemoryRemote implements RemoteStore {
  constructor(private cloud: MemoryCloud, readonly owner: string) {}
  private key(kind: SyncKind, id: string) {
    return `${this.owner}|${kind}|${id}`;
  }
  async list(kind: SyncKind): Promise<RemoteHead[]> {
    this.cloud.calls++;
    return [...this.cloud.rows.values()]
      .filter((r) => r.owner === this.owner && r.kind === kind)
      .map(({ id, revision, hash, deleted, updatedAt }) => ({ id, revision, hash, deleted, updatedAt }));
  }
  async get(kind: SyncKind, id: string): Promise<RemoteRecord | null> {
    const r = this.cloud.rows.get(this.key(kind, id));
    return r ? structuredClone({ id: r.id, revision: r.revision, hash: r.hash, deleted: r.deleted, updatedAt: r.updatedAt, payload: r.payload }) : null;
  }
  async insert(kind: SyncKind, id: string, rec: RemoteWrite): Promise<'ok' | 'exists'> {
    const k = this.key(kind, id);
    if (this.cloud.rows.has(k)) return 'exists';
    this.cloud.rows.set(k, { owner: this.owner, kind, id, revision: 1, updatedAt: new Date().toISOString(), ...structuredClone(rec) });
    return 'ok';
  }
  async update(kind: SyncKind, id: string, expected: number, rec: RemoteWrite): Promise<'ok' | 'conflict'> {
    const k = this.key(kind, id);
    const r = this.cloud.rows.get(k);
    if (!r || r.revision !== expected) return 'conflict';
    this.cloud.rows.set(k, { ...r, ...structuredClone(rec), revision: expected + 1, updatedAt: new Date().toISOString() });
    return 'ok';
  }
  async uploadBlob(hash: string, data: ArrayBuffer): Promise<void> {
    const k = `${this.owner}/${hash}`;
    if (!this.cloud.blobs.has(k)) this.cloud.blobs.set(k, new Uint8Array(data).slice().buffer);
  }
  async downloadBlob(hash: string): Promise<ArrayBuffer | null> {
    const b = this.cloud.blobs.get(`${this.owner}/${hash}`);
    return b ? new Uint8Array(b).slice().buffer : null;
  }
}

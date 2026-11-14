export type SyncKind = 'folder' | 'asset' | 'project' | 'version';

/** Order matters: referenced records (folders, assets) go before projects and versions. */
export const SYNC_KINDS: SyncKind[] = ['folder', 'asset', 'project', 'version'];

export const KIND_LABEL: Record<SyncKind, string> = { folder: 'Pasta', asset: 'Asset', project: 'Projeto', version: 'Versão' };

/** Last state both sides agreed on, per account + record. */
export interface SyncStateRecord {
  key: string; // `${owner}|${kind}|${id}`
  owner: string;
  kind: SyncKind;
  id: string;
  revision: number;
  hash: string;
}

export type ConflictReason = 'both-modified' | 'local-deleted' | 'remote-deleted' | 'both-created';

export interface SyncConflict {
  key: string; // `${owner}|${kind}|${id}`
  owner: string;
  kind: SyncKind;
  recordId: string;
  reason: ConflictReason;
  localName: string;
  remoteName: string;
  remoteRevision: number;
  remoteUpdatedAt: string;
  detectedAt: number;
}

/** Remote row header (no payload). */
export interface RemoteHead {
  id: string;
  revision: number;
  hash: string;
  deleted: boolean;
  updatedAt: string;
}

export interface RemoteRecord extends RemoteHead {
  payload: unknown;
}

export interface RemoteWrite {
  hash: string;
  payload: unknown;
  deleted: boolean;
}

/** Cloud backend contract. Implemented by Supabase (production) and an in-memory store (tests). */
export interface RemoteStore {
  readonly owner: string;
  list(kind: SyncKind): Promise<RemoteHead[]>;
  get(kind: SyncKind, id: string): Promise<RemoteRecord | null>;
  /** Create at revision 1. Returns "exists" when the id is already taken. */
  insert(kind: SyncKind, id: string, rec: RemoteWrite): Promise<'ok' | 'exists'>;
  /** Write revision expected+1 only if the stored revision is still `expected`. */
  update(kind: SyncKind, id: string, expected: number, rec: RemoteWrite): Promise<'ok' | 'conflict'>;
  uploadBlob(hash: string, data: ArrayBuffer, mime: string): Promise<void>;
  downloadBlob(hash: string): Promise<ArrayBuffer | null>;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: number;
  errors: string[];
  startedAt: number;
  finishedAt: number;
}

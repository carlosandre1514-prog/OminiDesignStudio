import type { Asset, AssetFolder } from '@/core/assets/types';
import { ASSET_CATEGORIES } from '@/core/assets/types';
import type { OmniDatabase } from '@/core/db/database';
import { PROJECT_CATEGORIES, PROJECT_SCHEMA_VERSION, type ProjectMeta, type ProjectVersion } from '@/core/projects/types';
import { sha256Hex } from '@/core/utils/binary';
import type { RemoteStore, SyncKind } from './types';

/** Deterministic JSON (sorted keys) so equal content always hashes the same. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`;
}

export async function hashPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  return sha256Hex(bytes.buffer as ArrayBuffer);
}

export interface ProjectPayload {
  meta: Omit<ProjectMeta, 'lastOpenedAt'>;
  modules: Record<string, unknown>;
}

/** Local side of one record type. */
export interface KindAdapter {
  kind: SyncKind;
  listIds(): Promise<string[]>;
  /** Payload to upload, or null when the record doesn't exist locally. */
  read(id: string): Promise<unknown | null>;
  /** Human readable name (for conflict lists). */
  nameOf(payload: unknown): string;
  /** Validate and store a payload received from the cloud. Throws on invalid data. */
  write(id: string, payload: unknown, remote: RemoteStore): Promise<void>;
  remove(id: string): Promise<void>;
  /** Called before creating the record remotely (assets upload their bytes). */
  beforePush?(id: string, payload: unknown, remote: RemoteStore): Promise<void>;
}

class InvalidPayload extends Error {}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = 2000) => typeof v === 'string' && v.length <= max;

export function createAdapters(db: OmniDatabase): Record<SyncKind, KindAdapter> {
  const project: KindAdapter = {
    kind: 'project',
    listIds: async () => (await db.projects.toCollection().primaryKeys()) as string[],
    async read(id) {
      const meta = await db.projects.get(id);
      const doc = await db.documents.get(id);
      if (!meta || !doc) return null;
      // lastOpenedAt is device-local and must not create sync traffic.
      const { lastOpenedAt: _l, ...rest } = meta;
      return { meta: rest, modules: doc.modules } satisfies ProjectPayload;
    },
    nameOf: (p) => (isObj(p) && isObj(p.meta) && typeof p.meta.name === 'string' ? p.meta.name : '(sem nome)'),
    async write(id, payload) {
      if (!isObj(payload) || !isObj(payload.meta) || !isObj(payload.modules)) throw new InvalidPayload('Projeto inválido vindo da nuvem');
      const m = payload.meta;
      if (!str(m.name, 200) || !PROJECT_CATEGORIES.some((c) => c.id === m.category)) throw new InvalidPayload('Metadados de projeto inválidos');
      if (typeof m.schemaVersion === 'number' && m.schemaVersion > PROJECT_SCHEMA_VERSION)
        throw new InvalidPayload('Projeto criado por uma versão mais nova do OmniDesign Studio');
      const existing = await db.projects.get(id);
      const meta: ProjectMeta = {
        id,
        name: m.name as string,
        description: str(m.description) ? (m.description as string) : '',
        category: m.category as ProjectMeta['category'],
        thumbnail: typeof m.thumbnail === 'string' && m.thumbnail.startsWith('data:image/') ? m.thumbnail : undefined,
        createdAt: Number(m.createdAt) || Date.now(),
        updatedAt: Number(m.updatedAt) || Date.now(),
        favorite: !!m.favorite,
        tags: Array.isArray(m.tags) ? m.tags.filter((t): t is string => str(t, 40)) : [],
        storage: 'local',
        schemaVersion: PROJECT_SCHEMA_VERSION,
        lastOpenedAt: existing?.lastOpenedAt,
      };
      await db.transaction('rw', db.projects, db.documents, db.history, async () => {
        await db.projects.put(meta);
        await db.documents.put({ projectId: id, modules: payload.modules as Record<string, unknown>, updatedAt: meta.updatedAt });
        await db.history.add({ projectId: id, at: Date.now(), action: existing ? 'Atualizado pela sincronização' : 'Recebido da nuvem' });
      });
    },
    async remove(id) {
      await db.transaction('rw', [db.projects, db.documents, db.versions, db.history, db.assets], async () => {
        await db.assets
          .where('projectIds')
          .equals(id)
          .modify((a) => {
            a.projectIds = a.projectIds.filter((p) => p !== id);
          });
        await db.projects.delete(id);
        await db.documents.delete(id);
        await db.versions.where('projectId').equals(id).delete();
        await db.history.where('projectId').equals(id).delete();
      });
    },
  };

  const version: KindAdapter = {
    kind: 'version',
    listIds: async () => (await db.versions.toCollection().primaryKeys()) as string[],
    read: async (id) => (await db.versions.get(id)) ?? null,
    nameOf: (p) => (isObj(p) && typeof p.label === 'string' ? p.label : '(versão)'),
    async write(id, p) {
      if (!isObj(p) || !str(p.projectId, 100) || typeof p.snapshot !== 'string') throw new InvalidPayload('Versão inválida vinda da nuvem');
      const v: ProjectVersion = {
        id,
        projectId: p.projectId as string,
        label: str(p.label, 200) ? (p.label as string) : 'Versão',
        createdAt: Number(p.createdAt) || Date.now(),
        auto: !!p.auto,
        snapshot: p.snapshot,
        size: p.snapshot.length,
      };
      await db.versions.put(v);
    },
    remove: async (id) => {
      await db.versions.delete(id);
    },
  };

  const folder: KindAdapter = {
    kind: 'folder',
    listIds: async () => (await db.folders.toCollection().primaryKeys()) as string[],
    read: async (id) => (await db.folders.get(id)) ?? null,
    nameOf: (p) => (isObj(p) && typeof p.name === 'string' ? p.name : '(pasta)'),
    async write(id, p) {
      if (!isObj(p) || !str(p.name, 200)) throw new InvalidPayload('Pasta inválida vinda da nuvem');
      const f: AssetFolder = { id, name: p.name as string, parentId: str(p.parentId, 100) ? (p.parentId as string) : null, createdAt: Number(p.createdAt) || Date.now() };
      await db.folders.put(f);
    },
    remove: async (id) => {
      // Like deleteFolder(): contents move up instead of being lost.
      const f = await db.folders.get(id);
      if (!f) return;
      await db.transaction('rw', db.folders, db.assets, async () => {
        await db.assets.where('folderId').equals(id).modify({ folderId: f.parentId });
        await db.folders.where('parentId').equals(id).modify({ parentId: f.parentId });
        await db.folders.delete(id);
      });
    },
  };

  const asset: KindAdapter = {
    kind: 'asset',
    listIds: async () => (await db.assets.toCollection().primaryKeys()) as string[],
    read: async (id) => (await db.assets.get(id)) ?? null,
    nameOf: (p) => (isObj(p) && typeof p.name === 'string' ? p.name : '(asset)'),
    async beforePush(_id, p, remote) {
      const a = p as Asset;
      const data = await db.assetData.get(a.hash);
      if (!data) throw new Error(`Conteúdo do asset "${a.name}" ausente localmente`);
      await remote.uploadBlob(a.hash, data.data, a.mime);
    },
    async write(id, p, remote) {
      if (!isObj(p) || !str(p.name, 200) || typeof p.hash !== 'string' || !/^[0-9a-f]{64}$/.test(p.hash)) throw new InvalidPayload('Asset inválido vindo da nuvem');
      if (!['image', 'vector', 'audio', 'font', 'model3d', 'component'].includes(p.kind as string) || !ASSET_CATEGORIES.some((c) => c.id === p.category))
        throw new InvalidPayload('Tipo de asset inválido vindo da nuvem');
      const hash = p.hash as string;
      if (!(await db.assetData.get(hash))) {
        const data = await remote.downloadBlob(hash);
        if (!data) throw new Error(`Arquivo do asset "${p.name}" não encontrado na nuvem`);
        // Integrity check: the content must match its address.
        if ((await sha256Hex(data)) !== hash) throw new Error(`Arquivo do asset "${p.name}" corrompido (hash não confere)`);
        await db.assetData.put({ hash, data, mime: String(p.mime) });
      }
      const a = p as unknown as Asset;
      await db.assets.put({
        ...a,
        id,
        tags: Array.isArray(a.tags) ? a.tags : [],
        projectIds: Array.isArray(a.projectIds) ? a.projectIds : [],
        thumbnail: typeof a.thumbnail === 'string' && a.thumbnail.startsWith('data:image/') ? a.thumbnail : undefined,
        meta: isObj(a.meta) ? a.meta : {},
      });
    },
    async remove(id) {
      await db.transaction('rw', db.assets, db.assetData, async () => {
        const a = await db.assets.get(id);
        if (!a) return;
        await db.assets.delete(id);
        if ((await db.assets.where('hash').equals(a.hash).count()) === 0) await db.assetData.delete(a.hash);
      });
    },
  };

  return { project, version, folder, asset };
}

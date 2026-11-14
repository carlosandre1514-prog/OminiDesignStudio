import { db } from '@/core/db/database';
import { blobToArrayBuffer, sha256Hex } from '@/core/utils/binary';
import { createId } from '@/core/utils/id';
import { sanitizeName, slugify } from '@/core/utils/sanitize';
import { detectFormat, extOf, validateContent } from './formats';
import { analyzeMedia } from './media';
import { ASSET_CATEGORIES, type Asset, type AssetCategory, type AssetFolder } from './types';

export class AssetError extends Error {}

export interface ImportOptions {
  maxSizeBytes?: number;
  folderId?: string | null;
  projectId?: string | null;
  category?: AssetCategory;
  tags?: string[];
}

export type ImportResult =
  | { status: 'created'; asset: Asset; fileName: string }
  | { status: 'duplicate'; asset: Asset; fileName: string }
  | { status: 'error'; error: string; fileName: string };

const isCategory = (c: unknown): c is AssetCategory => ASSET_CATEGORIES.some((x) => x.id === c);
const cleanTags = (tags: string[]) => [...new Set(tags.map((t) => sanitizeName(t, '', 40).toLowerCase()).filter(Boolean))];

/** Import a single file: validates extension + content, deduplicates by content hash. */
export async function importAssetFile(file: File, opts: ImportOptions = {}): Promise<ImportResult> {
  if (opts.maxSizeBytes && file.size > opts.maxSizeBytes)
    return { status: 'error', fileName: file.name, error: `Arquivo maior que o limite (${Math.round(opts.maxSizeBytes / 1048576)} MB)` };
  if (!detectFormat(file.name)) return { status: 'error', fileName: file.name, error: `Formato ".${extOf(file.name) || '?'}" não suportado` };
  let data: ArrayBuffer;
  try {
    data = await blobToArrayBuffer(file);
  } catch {
    return { status: 'error', fileName: file.name, error: 'Não foi possível ler o arquivo' };
  }
  return importAssetBytes(file.name, data, opts);
}

/** Import raw bytes under a file name (used by file import and ZIP packages). */
export async function importAssetBytes(fileName: string, data: ArrayBuffer, opts: ImportOptions & { name?: string; thumbnail?: string } = {}): Promise<ImportResult> {
  const fmt = detectFormat(fileName);
  if (!fmt) return { status: 'error', fileName, error: `Formato ".${extOf(fileName) || '?'}" não suportado` };
  if (opts.maxSizeBytes && data.byteLength > opts.maxSizeBytes)
    return { status: 'error', fileName, error: `Arquivo maior que o limite (${Math.round(opts.maxSizeBytes / 1048576)} MB)` };
  const invalid = validateContent(fmt.ext, new Uint8Array(data));
  if (invalid) return { status: 'error', fileName, error: invalid };
  const hash = await sha256Hex(data);

  const existing = await db.assets.where('hash').equals(hash).first();
  if (existing) {
    // Same content already in the library: reuse it (and link it to the project if requested).
    if (opts.projectId) await linkAssetToProject(existing.id, opts.projectId);
    return { status: 'duplicate', fileName, asset: (await db.assets.get(existing.id))! };
  }

  const analyzed = await analyzeMedia(fmt.kind, new Blob([data], { type: fmt.mime }));
  const meta = analyzed.meta;
  const thumbnail = analyzed.thumbnail ?? (opts.thumbnail?.startsWith('data:image/') ? opts.thumbnail : undefined);
  const now = Date.now();
  const asset: Asset = {
    id: createId('ast'),
    name: sanitizeName(opts.name ?? fileName.replace(/\.[^.]+$/, ''), 'asset'),
    kind: fmt.kind,
    category: opts.category && isCategory(opts.category) ? opts.category : fmt.category,
    mime: fmt.mime,
    ext: fmt.ext,
    size: data.byteLength,
    hash,
    folderId: opts.folderId ?? null,
    tags: cleanTags(opts.tags ?? []),
    favorite: false,
    projectIds: opts.projectId ? [opts.projectId] : [],
    thumbnail,
    meta,
    originalName: fileName,
    createdAt: now,
    updatedAt: now,
  };
  await db.transaction('rw', db.assets, db.assetData, async () => {
    if (!(await db.assetData.get(hash))) await db.assetData.add({ hash, data, mime: fmt.mime });
    await db.assets.add(asset);
  });
  return { status: 'created', fileName, asset };
}

export async function importAssetFiles(files: File[], opts: ImportOptions = {}): Promise<ImportResult[]> {
  const out: ImportResult[] = [];
  for (const f of files) out.push(await importAssetFile(f, opts));
  return out;
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  return db.assets.get(id);
}

export async function getAssetBlob(id: string): Promise<Blob | null> {
  const a = await db.assets.get(id);
  if (!a) return null;
  const d = await db.assetData.get(a.hash);
  return d ? new Blob([d.data], { type: a.mime }) : null;
}

export async function getAssetBytes(id: string): Promise<ArrayBuffer | null> {
  const a = await db.assets.get(id);
  if (!a) return null;
  return (await db.assetData.get(a.hash))?.data ?? null;
}

export interface AssetQuery {
  text?: string;
  kind?: string;
  category?: string;
  /** undefined = all folders; null = root only */
  folderId?: string | null;
  tag?: string;
  favorite?: boolean;
  projectId?: string;
  sort?: 'name' | 'created' | 'updated' | 'size';
}

export async function queryAssets(q: AssetQuery = {}): Promise<Asset[]> {
  let rows = q.projectId ? await db.assets.where('projectIds').equals(q.projectId).toArray() : await db.assets.toArray();
  const term = q.text?.trim().toLowerCase();
  rows = rows.filter(
    (a) =>
      (!q.kind || a.kind === q.kind) &&
      (!q.category || a.category === q.category) &&
      (q.folderId === undefined || a.folderId === q.folderId) &&
      (!q.tag || a.tags.includes(q.tag)) &&
      (!q.favorite || a.favorite) &&
      (!term || a.name.toLowerCase().includes(term) || a.originalName.toLowerCase().includes(term) || a.tags.some((t) => t.includes(term))),
  );
  const sort = q.sort ?? 'created';
  rows.sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : sort === 'updated' ? b.updatedAt - a.updatedAt : b.createdAt - a.createdAt,
  );
  return rows;
}

export async function listAllTags(): Promise<string[]> {
  const keys = (await db.assets.orderBy('tags').uniqueKeys()) as string[];
  return keys.sort();
}

export async function updateAsset(
  id: string,
  patch: Partial<Pick<Asset, 'name' | 'category' | 'tags' | 'favorite' | 'folderId'>>,
): Promise<void> {
  const clean: Partial<Asset> = { ...patch };
  if (patch.name !== undefined) clean.name = sanitizeName(patch.name, 'asset');
  if (patch.category !== undefined && !isCategory(patch.category)) throw new AssetError('Categoria inválida');
  if (patch.tags !== undefined) clean.tags = cleanTags(patch.tags);
  if (patch.folderId !== undefined && patch.folderId !== null && !(await db.folders.get(patch.folderId))) throw new AssetError('Pasta não encontrada');
  if (patch.name !== undefined || patch.category !== undefined || patch.tags !== undefined || patch.folderId !== undefined) clean.updatedAt = Date.now();
  const n = await db.assets.update(id, clean);
  if (!n) throw new AssetError('Asset não encontrado');
}

/** Duplicate a library entry. The bytes are shared (content-addressed), only metadata is copied. */
export async function duplicateAsset(id: string): Promise<Asset> {
  const a = await db.assets.get(id);
  if (!a) throw new AssetError('Asset não encontrado');
  const now = Date.now();
  const copy: Asset = { ...structuredClone(a), id: createId('ast'), name: `${a.name} (cópia)`, projectIds: [], favorite: false, createdAt: now, updatedAt: now };
  await db.assets.add(copy);
  return copy;
}

/** Delete assets; content bytes are garbage-collected when no entry references them anymore. */
export async function deleteAssets(ids: string[]): Promise<void> {
  await db.transaction('rw', db.assets, db.assetData, async () => {
    const rows = (await db.assets.bulkGet(ids)).filter((a): a is Asset => !!a);
    await db.assets.bulkDelete(rows.map((a) => a.id));
    for (const hash of new Set(rows.map((a) => a.hash))) {
      if ((await db.assets.where('hash').equals(hash).count()) === 0) await db.assetData.delete(hash);
    }
  });
}

export async function linkAssetToProject(assetId: string, projectId: string): Promise<void> {
  await db.assets
    .where('id')
    .equals(assetId)
    .modify((a) => {
      if (!a.projectIds.includes(projectId)) a.projectIds.push(projectId);
    });
}

export async function unlinkAssetFromProject(assetId: string, projectId: string): Promise<void> {
  await db.assets
    .where('id')
    .equals(assetId)
    .modify((a) => {
      a.projectIds = a.projectIds.filter((p) => p !== projectId);
    });
}

/** Remove a deleted project from every asset's links (assets themselves are kept). */
export async function unlinkProjectEverywhere(projectId: string): Promise<void> {
  await db.assets
    .where('projectIds')
    .equals(projectId)
    .modify((a) => {
      a.projectIds = a.projectIds.filter((p) => p !== projectId);
    });
}

// ---------- folders ----------

export async function listFolders(): Promise<AssetFolder[]> {
  return (await db.folders.toArray()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createFolder(name: string, parentId: string | null = null): Promise<AssetFolder> {
  if (parentId && !(await db.folders.get(parentId))) throw new AssetError('Pasta pai não encontrada');
  const f: AssetFolder = { id: createId('fld'), name: sanitizeName(name, 'Nova pasta', 80), parentId, createdAt: Date.now() };
  await db.folders.add(f);
  return f;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db.folders.update(id, { name: sanitizeName(name, 'Pasta', 80) });
}

export async function moveFolder(id: string, parentId: string | null): Promise<void> {
  // Prevent cycles: the new parent cannot be the folder itself or one of its descendants.
  let cur = parentId;
  while (cur) {
    if (cur === id) throw new AssetError('Não é possível mover uma pasta para dentro dela mesma');
    cur = (await db.folders.get(cur))?.parentId ?? null;
  }
  await db.folders.update(id, { parentId });
}

/** Delete a folder without losing content: its assets and sub-folders move to the parent folder. */
export async function deleteFolder(id: string): Promise<void> {
  const f = await db.folders.get(id);
  if (!f) return;
  await db.transaction('rw', db.folders, db.assets, async () => {
    await db.assets.where('folderId').equals(id).modify({ folderId: f.parentId });
    await db.folders.where('parentId').equals(id).modify({ parentId: f.parentId });
    await db.folders.delete(id);
  });
}

// ---------- export ----------

export function assetFileName(a: Pick<Asset, 'id' | 'name' | 'ext'>): string {
  return `${slugify(a.name, 'asset')}-${a.id.slice(-6)}.${a.ext}`;
}

export interface AssetManifestEntry {
  id: string;
  file: string;
  name: string;
  kind: Asset['kind'];
  category: AssetCategory;
  mime: string;
  ext: string;
  tags: string[];
  hash: string;
  meta: Asset['meta'];
}

/** Collect assets as a ZIP-ready file map (binary) + manifest. */
export async function buildAssetPackage(ids: string[], dir = 'assets'): Promise<{ files: Record<string, Uint8Array>; manifest: AssetManifestEntry[]; missing: string[] }> {
  const files: Record<string, Uint8Array> = {};
  const manifest: AssetManifestEntry[] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const a = await db.assets.get(id);
    const data = a ? (await db.assetData.get(a.hash))?.data : undefined;
    if (!a || !data) {
      missing.push(id);
      continue;
    }
    const file = `${dir}/${assetFileName(a)}`;
    // Copy into a fresh view: stored buffers may come from another realm (structured clone).
    files[file] = new Uint8Array(data).slice();
    manifest.push({ id: a.id, file, name: a.name, kind: a.kind, category: a.category, mime: a.mime, ext: a.ext, tags: a.tags, hash: a.hash, meta: a.meta });
  }
  return { files, manifest, missing };
}

export async function exportAssetsZip(ids: string[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const { files, manifest } = await buildAssetPackage(ids);
  for (const [path, data] of Object.entries(files)) zip.file(path, data);
  zip.file('manifest.json', JSON.stringify({ format: 'omnidesign-assets', version: 1, assets: manifest }, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Bytes used by the library (unique content only). */
export async function libraryStats(): Promise<{ count: number; bytes: number; logicalBytes: number }> {
  const assets = await db.assets.toArray();
  const unique = new Map(assets.map((a) => [a.hash, a.size]));
  return { count: assets.length, bytes: [...unique.values()].reduce((s, n) => s + n, 0), logicalBytes: assets.reduce((s, a) => s + a.size, 0) };
}

/** Import an asset package ZIP (manifest.json + files), as produced by exportAssetsZip. */
export async function importAssetsZip(blob: Blob, maxSizeBytes?: number): Promise<ImportResult[]> {
  const { default: JSZip } = await import('jszip');
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
  } catch {
    throw new AssetError('ZIP corrompido ou inválido');
  }
  const manifestFile = zip.file('manifest.json');
  let entries: Partial<AssetManifestEntry>[] = [];
  if (manifestFile) {
    try {
      const m = JSON.parse(await manifestFile.async('string'));
      if (Array.isArray(m?.assets)) entries = m.assets;
    } catch {
      throw new AssetError('manifest.json corrompido');
    }
  } else {
    // Plain ZIP of files: import every supported file.
    entries = Object.values(zip.files).filter((f) => !f.dir && detectFormat(f.name)).map((f) => ({ file: f.name }));
  }
  const out: ImportResult[] = [];
  for (const e of entries) {
    if (typeof e.file !== 'string' || e.file.includes('..')) continue;
    const f = zip.file(e.file);
    if (!f) {
      out.push({ status: 'error', fileName: e.file, error: 'Arquivo ausente no pacote' });
      continue;
    }
    out.push(
      await importAssetBytes(e.file.split('/').pop()!, await f.async('arraybuffer'), {
        maxSizeBytes,
        name: typeof e.name === 'string' ? e.name : undefined,
        category: e.category,
        tags: Array.isArray(e.tags) ? e.tags : [],
      }),
    );
  }
  return out;
}

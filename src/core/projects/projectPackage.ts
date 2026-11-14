import { db } from '@/core/db/database';
import { buildAssetPackage, importAssetBytes, linkAssetToProject, type AssetManifestEntry } from '@/core/assets/assetService';
import { assetUri, parseAssetUri } from '@/core/assets/types';
import { blobToArrayBuffer } from '@/core/utils/binary';
import { exportProject, importProject, ProjectError, validateOmniFile } from './projectService';
import type { OmniFile, ProjectMeta } from './types';

/** Every asset id referenced (as "asset:<id>") anywhere inside module data. */
export function findAssetRefs(value: unknown, out = new Set<string>()): Set<string> {
  const id = parseAssetUri(value);
  if (id) out.add(id);
  else if (Array.isArray(value)) value.forEach((v) => findAssetRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => findAssetRefs(v, out));
  return out;
}

/** Deep copy replacing asset references through the id map. */
export function rewriteAssetRefs<T>(value: T, map: Map<string, string>): T {
  const id = parseAssetUri(value);
  if (id) return (map.has(id) ? assetUri(map.get(id)!) : value) as T;
  if (Array.isArray(value)) return value.map((v) => rewriteAssetRefs(v, map)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewriteAssetRefs(v, map);
    return out as T;
  }
  return value;
}

/** Referenced asset ids that are not in the local library. */
export async function findMissingAssets(modules: unknown): Promise<string[]> {
  const refs = [...findAssetRefs(modules)];
  const found = await db.assets.bulkGet(refs);
  return refs.filter((_, i) => !found[i]);
}

/** Project package: project.omni + every linked or referenced asset + assets.json manifest. */
export async function exportProjectZip(projectId: string): Promise<Blob> {
  const omni = await exportProject(projectId);
  const linked = await db.assets.where('projectIds').equals(projectId).primaryKeys();
  const ids = [...new Set([...linked, ...findAssetRefs(omni.document.modules)])];
  const { files, manifest } = await buildAssetPackage(ids);
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('project.omni', JSON.stringify(omni));
  zip.file('assets.json', JSON.stringify({ format: 'omnidesign-assets', version: 1, assets: manifest }, null, 2));
  for (const [path, data] of Object.entries(files)) zip.file(path, data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export interface PackageImportResult {
  project: ProjectMeta;
  importedAssets: number;
  reusedAssets: number;
  /** Asset references that could not be resolved (dependency missing from package and library). */
  missing: string[];
  errors: string[];
}

/** Import a project ZIP. Always creates a new project; assets are deduplicated against the library. */
export async function importProjectZip(blob: Blob, maxSizeBytes?: number): Promise<PackageImportResult> {
  const { default: JSZip } = await import('jszip');
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(await blobToArrayBuffer(blob));
  } catch {
    throw new ProjectError('ZIP corrompido ou inválido');
  }
  const omniEntry = zip.file('project.omni') ?? zip.file(/\.omni$/i)[0];
  if (!omniEntry) throw new ProjectError('O ZIP não contém um arquivo project.omni');
  let omni: OmniFile;
  try {
    omni = JSON.parse(await omniEntry.async('string'));
  } catch {
    throw new ProjectError('project.omni corrompido: JSON inválido');
  }
  const check = validateOmniFile(omni);
  if (!check.ok) throw new ProjectError(check.errors.join('; '));

  let manifest: AssetManifestEntry[] = [];
  const manifestEntry = zip.file('assets.json');
  if (manifestEntry) {
    try {
      const m = JSON.parse(await manifestEntry.async('string'));
      if (Array.isArray(m?.assets)) manifest = m.assets;
    } catch {
      /* reported below as missing dependencies */
    }
  }

  const idMap = new Map<string, string>();
  const errors: string[] = [];
  let importedAssets = 0;
  let reusedAssets = 0;
  for (const entry of manifest) {
    if (typeof entry?.id !== 'string' || typeof entry.file !== 'string' || entry.file.includes('..')) continue;
    const f = zip.file(entry.file);
    if (!f) {
      errors.push(`Arquivo ausente no pacote: ${entry.file}`);
      continue;
    }
    const data = await f.async('arraybuffer');
    const res = await importAssetBytes(entry.file, data, { maxSizeBytes, name: entry.name, category: entry.category, tags: Array.isArray(entry.tags) ? entry.tags : [] });
    if (res.status === 'error') errors.push(`${entry.file}: ${res.error}`);
    else {
      idMap.set(entry.id, res.asset.id);
      if (res.status === 'created') importedAssets++;
      else reusedAssets++;
    }
  }

  const modules = rewriteAssetRefs(omni.document.modules, idMap);
  const versions = (omni.versions ?? []).map((v) => {
    try {
      return { ...v, snapshot: JSON.stringify(rewriteAssetRefs(JSON.parse(v.snapshot), idMap)) };
    } catch {
      return v;
    }
  });
  const project = await importProject({ ...omni, document: { modules }, versions });
  for (const newId of new Set(idMap.values())) await linkAssetToProject(newId, project.id);
  const missing = await findMissingAssets(modules);
  return { project, importedAssets, reusedAssets, missing, errors };
}

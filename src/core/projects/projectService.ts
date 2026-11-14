import { db } from '@/core/db/database';
import { createId } from '@/core/utils/id';
import { sanitizeName } from '@/core/utils/sanitize';
import {
  PROJECT_CATEGORIES,
  PROJECT_SCHEMA_VERSION,
  type OmniFile,
  type ProjectCategory,
  type ProjectDocument,
  type ProjectMeta,
  type ProjectVersion,
} from './types';

export interface CreateProjectInput {
  name: string;
  description?: string;
  category: ProjectCategory;
  tags?: string[];
  modules?: Record<string, unknown>;
}

const MAX_AUTO_VERSIONS = 20;

export class ProjectError extends Error {}

function isCategory(v: unknown): v is ProjectCategory {
  return PROJECT_CATEGORIES.some((c) => c.id === v);
}

export async function listProjects(): Promise<ProjectMeta[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function getProject(id: string): Promise<ProjectMeta | undefined> {
  return db.projects.get(id);
}

export async function getDocument(projectId: string): Promise<ProjectDocument | undefined> {
  return db.documents.get(projectId);
}

export async function logHistory(projectId: string, action: string): Promise<void> {
  await db.history.add({ projectId, action, at: Date.now() });
}

export async function getHistory(projectId: string, limit = 100) {
  const rows = await db.history.where('projectId').equals(projectId).sortBy('at');
  return rows.reverse().slice(0, limit);
}

export async function createProject(input: CreateProjectInput): Promise<ProjectMeta> {
  if (!isCategory(input.category)) throw new ProjectError('Categoria de projeto inválida');
  const now = Date.now();
  const meta: ProjectMeta = {
    id: createId('prj'),
    name: sanitizeName(input.name, 'Novo projeto'),
    description: (input.description ?? '').slice(0, 2000),
    category: input.category,
    createdAt: now,
    updatedAt: now,
    favorite: false,
    tags: (input.tags ?? []).map((t) => sanitizeName(t, '', 40)).filter(Boolean),
    storage: 'local',
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
  await db.transaction('rw', db.projects, db.documents, db.history, async () => {
    await db.projects.add(meta);
    await db.documents.add({ projectId: meta.id, modules: input.modules ?? {}, updatedAt: now });
    await logHistory(meta.id, 'Projeto criado');
  });
  return meta;
}

export async function updateProjectMeta(
  id: string,
  patch: Partial<Pick<ProjectMeta, 'name' | 'description' | 'category' | 'favorite' | 'tags' | 'thumbnail' | 'lastOpenedAt'>>,
): Promise<void> {
  const clean: Partial<ProjectMeta> = { ...patch };
  if (patch.name !== undefined) clean.name = sanitizeName(patch.name, 'Sem título');
  if (patch.description !== undefined) clean.description = patch.description.slice(0, 2000);
  if (patch.category !== undefined && !isCategory(patch.category)) throw new ProjectError('Categoria inválida');
  // Favorite/lastOpened/thumbnail are not content modifications.
  const touchesContent = patch.name !== undefined || patch.description !== undefined || patch.category !== undefined || patch.tags !== undefined;
  if (touchesContent) clean.updatedAt = Date.now();
  const n = await db.projects.update(id, clean);
  if (!n) throw new ProjectError('Projeto não encontrado');
}

/** Persist one module's state inside the project document. */
export async function saveModuleData(projectId: string, moduleId: string, data: unknown): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.projects, db.documents, async () => {
    const doc = await db.documents.get(projectId);
    if (!doc) throw new ProjectError('Documento do projeto não encontrado');
    doc.modules = { ...doc.modules, [moduleId]: data };
    doc.updatedAt = now;
    await db.documents.put(doc);
    await db.projects.update(projectId, { updatedAt: now });
  });
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', [db.projects, db.documents, db.versions, db.history], async () => {
    await db.projects.delete(id);
    await db.documents.delete(id);
    await db.versions.where('projectId').equals(id).delete();
    await db.history.where('projectId').equals(id).delete();
  });
}

export async function duplicateProject(id: string): Promise<ProjectMeta> {
  const meta = await db.projects.get(id);
  const doc = await db.documents.get(id);
  if (!meta || !doc) throw new ProjectError('Projeto não encontrado');
  const copy = await createProject({
    name: `${meta.name} (cópia)`,
    description: meta.description,
    category: meta.category,
    tags: meta.tags,
    modules: structuredClone(doc.modules),
  });
  if (meta.thumbnail) await db.projects.update(copy.id, { thumbnail: meta.thumbnail });
  return { ...copy, thumbnail: meta.thumbnail };
}

// ---------- Versions / restore points ----------

export async function createVersion(projectId: string, label: string, auto = false): Promise<ProjectVersion> {
  const doc = await db.documents.get(projectId);
  if (!doc) throw new ProjectError('Projeto não encontrado');
  const snapshot = JSON.stringify(doc.modules);
  const version: ProjectVersion = {
    id: createId('ver'),
    projectId,
    label: sanitizeName(label, auto ? 'Automático' : 'Ponto de restauração'),
    createdAt: Date.now(),
    auto,
    snapshot,
    size: snapshot.length,
  };
  await db.versions.add(version);
  if (auto) await pruneAutoVersions(projectId);
  await logHistory(projectId, `Versão criada: ${version.label}`);
  return version;
}

async function pruneAutoVersions(projectId: string) {
  const autos = (await db.versions.where('projectId').equals(projectId).sortBy('createdAt')).filter((v) => v.auto);
  const excess = autos.length - MAX_AUTO_VERSIONS;
  if (excess > 0) await db.versions.bulkDelete(autos.slice(0, excess).map((v) => v.id));
}

export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  const rows = await db.versions.where('projectId').equals(projectId).sortBy('createdAt');
  return rows.reverse();
}

export async function deleteVersion(versionId: string): Promise<void> {
  await db.versions.delete(versionId);
}

/**
 * Restore a version without destroying the current state:
 * the current document is first saved as a backup version.
 */
export async function restoreVersion(versionId: string): Promise<ProjectDocument> {
  const version = await db.versions.get(versionId);
  if (!version) throw new ProjectError('Versão não encontrada');
  let modules: Record<string, unknown>;
  try {
    modules = JSON.parse(version.snapshot);
  } catch {
    throw new ProjectError('Versão corrompida: não foi possível ler o snapshot');
  }
  await createVersion(version.projectId, `Backup antes de restaurar "${version.label}"`);
  const now = Date.now();
  const doc: ProjectDocument = { projectId: version.projectId, modules, updatedAt: now };
  await db.transaction('rw', db.documents, db.projects, async () => {
    await db.documents.put(doc);
    await db.projects.update(version.projectId, { updatedAt: now });
  });
  await logHistory(version.projectId, `Versão restaurada: ${version.label}`);
  return doc;
}

// ---------- Import / export (.omni) ----------

export async function exportProject(id: string, includeVersions = true): Promise<OmniFile> {
  const meta = await db.projects.get(id);
  const doc = await db.documents.get(id);
  if (!meta || !doc) throw new ProjectError('Projeto não encontrado');
  const versions = includeVersions ? await listVersions(id) : [];
  return {
    format: 'omnidesign-project',
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    meta,
    document: { modules: doc.modules },
    versions: versions.map(({ projectId: _p, ...v }) => v),
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  file?: OmniFile;
}

export function validateOmniFile(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['Arquivo não contém um objeto JSON'] };
  const f = raw as Partial<OmniFile>;
  if (f.format !== 'omnidesign-project') errors.push('Formato desconhecido (esperado "omnidesign-project")');
  if (typeof f.schemaVersion !== 'number') errors.push('schemaVersion ausente');
  else if (f.schemaVersion > PROJECT_SCHEMA_VERSION)
    errors.push(`Versão do arquivo (${f.schemaVersion}) é mais nova que a suportada (${PROJECT_SCHEMA_VERSION})`);
  if (!f.meta || typeof f.meta !== 'object') errors.push('Metadados ausentes');
  else {
    if (typeof f.meta.name !== 'string') errors.push('Nome do projeto ausente');
    if (!isCategory(f.meta.category)) errors.push('Categoria inválida');
  }
  if (!f.document || typeof f.document !== 'object' || typeof f.document.modules !== 'object' || f.document.modules === null)
    errors.push('Documento do projeto ausente ou inválido');
  if (f.versions !== undefined && !Array.isArray(f.versions)) errors.push('Lista de versões inválida');
  return errors.length ? { ok: false, errors } : { ok: true, errors, file: f as OmniFile };
}

export function parseOmniText(text: string): ValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['Arquivo corrompido: JSON inválido'] };
  }
  return validateOmniFile(raw);
}

/** Import always creates a new project (never overwrites silently). */
export async function importProject(file: OmniFile): Promise<ProjectMeta> {
  const check = validateOmniFile(file);
  if (!check.ok) throw new ProjectError(check.errors.join('; '));
  const meta = await createProject({
    name: file.meta.name,
    description: file.meta.description ?? '',
    category: file.meta.category,
    tags: Array.isArray(file.meta.tags) ? file.meta.tags : [],
    modules: file.document.modules,
  });
  const thumb = typeof file.meta.thumbnail === 'string' && file.meta.thumbnail.startsWith('data:image/') ? file.meta.thumbnail : undefined;
  if (thumb) await db.projects.update(meta.id, { thumbnail: thumb });
  if (file.versions?.length) {
    await db.versions.bulkAdd(
      file.versions
        .filter((v) => typeof v.snapshot === 'string')
        .map((v) => ({
          id: createId('ver'),
          projectId: meta.id,
          label: sanitizeName(String(v.label ?? 'Versão importada')),
          createdAt: Number(v.createdAt) || Date.now(),
          auto: !!v.auto,
          snapshot: v.snapshot,
          size: v.snapshot.length,
        })),
    );
  }
  await logHistory(meta.id, 'Projeto importado');
  return { ...meta, thumbnail: thumb };
}

/** Approximate bytes used by a project (document + versions). */
export async function estimateProjectSize(id: string): Promise<number> {
  const doc = await db.documents.get(id);
  const meta = await db.projects.get(id);
  const versions = await db.versions.where('projectId').equals(id).toArray();
  return (
    (doc ? JSON.stringify(doc.modules).length : 0) +
    (meta?.thumbnail?.length ?? 0) +
    versions.reduce((s, v) => s + v.size, 0)
  );
}

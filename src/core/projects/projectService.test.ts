import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/database';
import {
  createProject,
  createVersion,
  deleteProject,
  duplicateProject,
  exportProject,
  getDocument,
  getHistory,
  importProject,
  listProjects,
  listVersions,
  parseOmniText,
  restoreVersion,
  saveModuleData,
  updateProjectMeta,
} from './projectService';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('projectService', () => {
  it('creates and lists projects with metadata', async () => {
    const p = await createProject({ name: '  Meu   site ', category: 'web', description: 'desc' });
    expect(p.name).toBe('Meu site');
    expect(p.storage).toBe('local');
    expect(p.createdAt).toBeGreaterThan(0);
    const all = await listProjects();
    expect(all.map((x) => x.id)).toEqual([p.id]);
    expect(await getDocument(p.id)).toMatchObject({ projectId: p.id, modules: {} });
    expect((await getHistory(p.id))[0].action).toBe('Projeto criado');
  });

  it('rejects invalid categories', async () => {
    // @ts-expect-error invalid category on purpose
    await expect(createProject({ name: 'x', category: 'nope' })).rejects.toThrow();
  });

  it('saves module data and bumps updatedAt', async () => {
    const p = await createProject({ name: 'a', category: 'web' });
    await new Promise((r) => setTimeout(r, 5));
    await saveModuleData(p.id, 'web-design', { hello: 1 });
    const doc = await getDocument(p.id);
    expect(doc?.modules['web-design']).toEqual({ hello: 1 });
    expect((await db.projects.get(p.id))!.updatedAt).toBeGreaterThan(p.updatedAt);
  });

  it('toggles favorite without touching updatedAt', async () => {
    const p = await createProject({ name: 'a', category: 'web' });
    await updateProjectMeta(p.id, { favorite: true });
    const after = await db.projects.get(p.id);
    expect(after?.favorite).toBe(true);
    expect(after?.updatedAt).toBe(p.updatedAt);
  });

  it('duplicates projects deeply', async () => {
    const p = await createProject({ name: 'orig', category: 'app', modules: { m: { list: [1, 2] } } });
    const c = await duplicateProject(p.id);
    expect(c.id).not.toBe(p.id);
    expect(c.name).toBe('orig (cópia)');
    expect((await getDocument(c.id))?.modules).toEqual({ m: { list: [1, 2] } });
    await saveModuleData(c.id, 'm', { list: [] });
    expect((await getDocument(p.id))?.modules.m).toEqual({ list: [1, 2] });
  });

  it('restores versions non-destructively', async () => {
    const p = await createProject({ name: 'v', category: 'web', modules: { m: 1 } });
    const v1 = await createVersion(p.id, 'um');
    await saveModuleData(p.id, 'm', 2);
    await restoreVersion(v1.id);
    expect((await getDocument(p.id))?.modules.m).toBe(1);
    const versions = await listVersions(p.id);
    expect(versions).toHaveLength(2);
    // The backup holds the state that existed before restoring.
    const backup = versions.find((v) => v.label.startsWith('Backup'))!;
    expect(JSON.parse(backup.snapshot).m).toBe(2);
  });

  it('prunes automatic versions beyond the limit', async () => {
    const p = await createProject({ name: 'v', category: 'web' });
    for (let i = 0; i < 23; i++) await createVersion(p.id, 'auto', true);
    await createVersion(p.id, 'manual');
    const vs = await listVersions(p.id);
    expect(vs.filter((v) => v.auto)).toHaveLength(20);
    expect(vs.filter((v) => !v.auto)).toHaveLength(1);
  });

  it('round-trips .omni export / import as a new project', async () => {
    const p = await createProject({ name: 'exp', category: 'game', tags: ['rpg'], modules: { gdd: { title: 'X' } } });
    await createVersion(p.id, 'v1');
    const file = await exportProject(p.id);
    const parsed = parseOmniText(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    const imported = await importProject(parsed.file!);
    expect(imported.id).not.toBe(p.id);
    expect(imported.tags).toEqual(['rpg']);
    expect((await getDocument(imported.id))?.modules).toEqual({ gdd: { title: 'X' } });
    expect(await listVersions(imported.id)).toHaveLength(1);
  });

  it('reports corrupted or invalid files', () => {
    expect(parseOmniText('{not json').errors[0]).toMatch(/JSON inválido/);
    const r = parseOmniText(JSON.stringify({ format: 'other', schemaVersion: 99, meta: { name: 1, category: 'x' } }));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(4);
  });

  it('deletes project with its documents, versions and history', async () => {
    const p = await createProject({ name: 'd', category: 'web' });
    await createVersion(p.id, 'v');
    await deleteProject(p.id);
    expect(await db.projects.count()).toBe(0);
    expect(await db.documents.count()).toBe(0);
    expect(await db.versions.count()).toBe(0);
    expect(await db.history.count()).toBe(0);
  });
});

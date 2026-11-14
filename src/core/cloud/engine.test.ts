import { beforeEach, describe, expect, it } from 'vitest';
import { importAssetFile } from '@/core/assets/assetService';
import { db, OmniDatabase } from '@/core/db/database';
import { createProject, createVersion, deleteProject, getDocument, listVersions, saveModuleData, updateProjectMeta } from '@/core/projects/projectService';
import { file, PNG_1PX } from '@/test/fixtures';
import { MemoryCloud } from '@/test/memoryRemote';
import { countPending, resolveConflict, syncAll, type SyncContext } from './engine';
import { createAdapters } from './kinds';

const OWNER = 'user-a';
let cloud: MemoryCloud;
let other: OmniDatabase; // a second device
let n = 0;

const ctxFor = (database: OmniDatabase, owner = OWNER, pulled?: string[]): SyncContext => ({
  db: database,
  remote: cloud.for(owner),
  adapters: createAdapters(database),
  onPulled: (k, id) => pulled?.push(`${k}:${id}`),
});
const A = (owner?: string) => ctxFor(db, owner);
const B = () => ctxFor(other);

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  cloud = new MemoryCloud();
  other = new OmniDatabase(`device-b-${++n}`);
  await other.open();
});

describe('cloud sync engine', () => {
  it('pushes new local data and pulls it on another device', async () => {
    const p = await createProject({ name: 'Site', category: 'web', modules: { m: { a: 1 } } });
    await createVersion(p.id, 'v1');
    const r1 = await syncAll(A());
    expect(r1).toMatchObject({ pushed: 2, conflicts: 0, errors: [] });
    expect(await countPending(db, A().adapters, OWNER)).toBe(0);

    const pulled: string[] = [];
    const r2 = await syncAll(ctxFor(other, OWNER, pulled));
    expect(r2).toMatchObject({ pulled: 2, pushed: 0, errors: [] });
    expect(pulled).toContain(`project:${p.id}`);
    expect((await other.documents.get(p.id))?.modules).toEqual({ m: { a: 1 } });
    expect((await other.projects.get(p.id))?.name).toBe('Site');
    // Nothing more to do on a second run.
    expect(await syncAll(ctxFor(other))).toMatchObject({ pulled: 0, pushed: 0 });
  });

  it('propagates edits in both directions without conflicts when sequential', async () => {
    const p = await createProject({ name: 'Site', category: 'web' });
    await syncAll(A());
    await syncAll(B());
    await saveModuleData(p.id, 'm', 'editado em A');
    expect(await countPending(db, A().adapters, OWNER)).toBe(1);
    expect(await syncAll(A())).toMatchObject({ pushed: 1 });
    expect(await syncAll(B())).toMatchObject({ pulled: 1 });
    expect((await other.documents.get(p.id))?.modules.m).toBe('editado em A');
    // Edit on B, back to A.
    await other.documents.update(p.id, { modules: { m: 'editado em B' } });
    await syncAll(B());
    await syncAll(A());
    expect((await getDocument(p.id))?.modules.m).toBe('editado em B');
  });

  it('device-local fields (lastOpenedAt) do not cause sync traffic', async () => {
    const p = await createProject({ name: 'X', category: 'web' });
    await syncAll(A());
    await updateProjectMeta(p.id, { lastOpenedAt: Date.now() + 1000 });
    expect(await countPending(db, A().adapters, OWNER)).toBe(0);
  });

  it('detects concurrent edits as a conflict and never overwrites silently', async () => {
    const p = await createProject({ name: 'Doc', category: 'web', modules: { m: 0 } });
    await syncAll(A());
    await syncAll(B());
    await saveModuleData(p.id, 'm', 'A');
    await other.documents.update(p.id, { modules: { m: 'B' } });
    await syncAll(B()); // B wins the race to the cloud
    const r = await syncAll(A());
    expect(r.conflicts).toBe(1);
    expect((await getDocument(p.id))?.modules.m).toBe('A'); // local kept
    const conflicts = await db.syncConflicts.toArray();
    expect(conflicts[0]).toMatchObject({ kind: 'project', recordId: p.id, reason: 'both-modified' });
    // Conflict stays until resolved.
    expect((await syncAll(A())).conflicts).toBe(1);
  });

  it('resolves conflicts: keep cloud (with local backup version)', async () => {
    const p = await createProject({ name: 'Doc', category: 'web', modules: { m: 0 } });
    await syncAll(A());
    await syncAll(B());
    await saveModuleData(p.id, 'm', 'A');
    await other.documents.update(p.id, { modules: { m: 'B' } });
    await syncAll(B());
    await syncAll(A());
    const [c] = await db.syncConflicts.toArray();
    await resolveConflict(A(), c.key, 'remote');
    expect((await getDocument(p.id))?.modules.m).toBe('B');
    const backup = (await listVersions(p.id)).find((v) => v.label.startsWith('Cópia local'));
    expect(JSON.parse(backup!.snapshot).m).toBe('A');
    expect(await db.syncConflicts.count()).toBe(0);
    // Backup version is synced as a new record; project is now in agreement.
    expect(await syncAll(A())).toMatchObject({ conflicts: 0, pushed: 1 });
  });

  it('resolves conflicts: keep local, and keep both', async () => {
    const p = await createProject({ name: 'Doc', category: 'web', modules: { m: 0 } });
    await syncAll(A());
    await syncAll(B());
    await saveModuleData(p.id, 'm', 'A');
    await other.documents.update(p.id, { modules: { m: 'B' } });
    await syncAll(B());
    await syncAll(A());
    let [c] = await db.syncConflicts.toArray();
    await resolveConflict(A(), c.key, 'local');
    await syncAll(B());
    expect((await other.documents.get(p.id))?.modules.m).toBe('A');

    // New conflict, now keep both.
    await saveModuleData(p.id, 'm', 'A2');
    await other.documents.update(p.id, { modules: { m: 'B2' } });
    await syncAll(B());
    await syncAll(A());
    [c] = await db.syncConflicts.toArray();
    await resolveConflict(A(), c.key, 'both');
    const all = await db.projects.toArray();
    expect(all).toHaveLength(2);
    const copy = all.find((x) => x.id !== p.id)!;
    expect(copy.name).toBe('Doc (cópia local)');
    expect((await getDocument(copy.id))?.modules.m).toBe('A2');
    expect((await getDocument(p.id))?.modules.m).toBe('B2');
  });

  it('propagates deletions and flags delete-vs-edit conflicts', async () => {
    const p = await createProject({ name: 'Del', category: 'web' });
    const q = await createProject({ name: 'Edit', category: 'web' });
    await syncAll(A());
    await syncAll(B());
    await deleteProject(p.id);
    expect(await syncAll(A())).toMatchObject({ deletedRemote: 1 });
    expect(await syncAll(B())).toMatchObject({ deletedLocal: 1 });
    expect(await other.projects.get(p.id)).toBeUndefined();

    // B edits q while A deletes it.
    await other.documents.update(q.id, { modules: { m: 'B' } });
    await syncAll(B());
    await deleteProject(q.id);
    const r = await syncAll(A());
    expect(r.conflicts).toBe(1);
    const [c] = await db.syncConflicts.toArray();
    expect(c.reason).toBe('local-deleted');
    await resolveConflict(A(), c.key, 'remote'); // restore the edited project
    expect((await getDocument(q.id))?.modules.m).toBe('B');
  });

  it('syncs assets with their content and verifies integrity', async () => {
    const r = await importAssetFile(file(PNG_1PX, 'img.png'));
    if (r.status === 'error') throw new Error(r.error);
    await syncAll(A());
    expect(cloud.blobs.size).toBe(1);
    expect(await syncAll(B())).toMatchObject({ pulled: 1, errors: [] });
    const asset = await other.assets.get(r.asset.id);
    expect(new Uint8Array((await other.assetData.get(asset!.hash))!.data)).toEqual(PNG_1PX);

    // Corrupted blob in the cloud is rejected.
    const third = new OmniDatabase(`device-c-${n}`);
    await third.open();
    for (const k of cloud.blobs.keys()) cloud.blobs.set(k, new Uint8Array([1, 2, 3]).buffer);
    const bad = await syncAll(ctxFor(third));
    expect(bad.errors.join()).toMatch(/corrompido/);
    expect(await third.assets.count()).toBe(0);
  });

  it('keeps accounts isolated', async () => {
    await createProject({ name: 'Só da A', category: 'web' });
    await syncAll(A());
    const bOwner = ctxFor(other, 'user-b');
    expect(await syncAll(bOwner)).toMatchObject({ pulled: 0 });
    expect(await other.projects.count()).toBe(0);
  });

  it('rejects invalid payloads from the cloud', async () => {
    await cloud.for(OWNER).insert('project', 'prj_evil', { hash: 'x'.repeat(64), payload: { meta: { name: 1 }, modules: {} }, deleted: false });
    const r = await syncAll(B());
    expect(r.errors.join()).toMatch(/inválidos/);
    expect(await other.projects.count()).toBe(0);
  });
});

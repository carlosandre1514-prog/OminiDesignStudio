import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/database';
import { importAssetFile } from '@/core/assets/assetService';
import { assetUri } from '@/core/assets/types';
import { file, PNG_1PX } from '@/test/fixtures';
import { exportProjectZip, findAssetRefs, findMissingAssets, importProjectZip, rewriteAssetRefs } from './projectPackage';
import { createProject, createVersion, getDocument, listVersions } from './projectService';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('project packages', () => {
  it('finds and rewrites asset references deeply', () => {
    const data = { a: [{ src: 'asset:1' }, { src: 'https://x' }], b: { c: 'asset:2' } };
    expect([...findAssetRefs(data)].sort()).toEqual(['1', '2']);
    expect(rewriteAssetRefs(data, new Map([['1', '9']]))).toEqual({ a: [{ src: 'asset:9' }, { src: 'https://x' }], b: { c: 'asset:2' } });
  });

  it('round-trips a project with its assets, remapping references', async () => {
    const r = await importAssetFile(file(PNG_1PX, 'img.png'));
    if (r.status === 'error') throw new Error(r.error);
    const p = await createProject({ name: 'Pacote', category: 'web', modules: { 'web-design': { screens: [{ elements: [{ src: assetUri(r.asset.id) }] }] } } });
    await createVersion(p.id, 'v1');
    const zip = await exportProjectZip(p.id);
    // Simulate another device: empty library.
    await Promise.all(db.tables.map((t) => t.clear()));
    const res = await importProjectZip(zip);
    expect(res.importedAssets).toBe(1);
    expect(res.missing).toEqual([]);
    expect(res.errors).toEqual([]);
    const doc = await getDocument(res.project.id);
    const newRef = [...findAssetRefs(doc!.modules)][0];
    const asset = await db.assets.get(newRef);
    expect(asset?.projectIds).toEqual([res.project.id]);
    const [v] = await listVersions(res.project.id);
    expect([...findAssetRefs(JSON.parse(v.snapshot))]).toEqual([newRef]);
  });

  it('reuses existing assets and reports missing dependencies', async () => {
    const r = await importAssetFile(file(PNG_1PX, 'img.png'));
    if (r.status === 'error') throw new Error(r.error);
    const p = await createProject({ name: 'X', category: 'web', modules: { m: { a: assetUri(r.asset.id), b: assetUri('ast_ghost') } } });
    const res = await importProjectZip(await exportProjectZip(p.id));
    expect(res.reusedAssets).toBe(1);
    expect(res.missing).toEqual(['ast_ghost']);
    expect(await findMissingAssets({ x: 'asset:nope' })).toEqual(['nope']);
  });

  it('rejects invalid packages', async () => {
    await expect(importProjectZip(new Blob(['not a zip']))).rejects.toThrow(/ZIP/);
  });
});

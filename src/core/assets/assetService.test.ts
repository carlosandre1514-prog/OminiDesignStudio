import { beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { db } from '@/core/db/database';
import { createProject, deleteProject } from '@/core/projects/projectService';
import { file, GLTF, OBJ, PNG_1PX, PNG_OTHER, SVG, WAV, WOFF2 } from '@/test/fixtures';
import {
  createFolder,
  deleteAssets,
  deleteFolder,
  duplicateAsset,
  exportAssetsZip,
  getAssetBytes,
  importAssetFile,
  importAssetFiles,
  libraryStats,
  linkAssetToProject,
  listAllTags,
  moveFolder,
  queryAssets,
  updateAsset,
} from './assetService';
import { validateContent } from './formats';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('format validation', () => {
  it('accepts real headers and rejects mismatched content', () => {
    expect(validateContent('png', PNG_1PX)).toBeNull();
    expect(validateContent('jpg', PNG_1PX)).toMatch(/JPEG/);
    expect(validateContent('svg', SVG)).toBeNull();
    expect(validateContent('wav', WAV)).toBeNull();
    expect(validateContent('woff2', WOFF2)).toBeNull();
    expect(validateContent('obj', OBJ)).toBeNull();
    expect(validateContent('gltf', GLTF)).toBeNull();
    expect(validateContent('gltf', new TextEncoder().encode('{bad'))).toMatch(/corrompido/);
    expect(validateContent('png', new Uint8Array())).toBe('Arquivo vazio');
    const stl = new Uint8Array(84 + 50);
    new DataView(stl.buffer).setUint32(80, 1, true);
    expect(validateContent('stl', stl)).toBeNull();
    expect(validateContent('stl', stl.subarray(0, 120))).toMatch(/STL/);
  });
});

describe('assetService', () => {
  it('imports files with detected kind/category and rejects invalid ones', async () => {
    const res = await importAssetFiles([
      file(PNG_1PX, 'foto.png'),
      file(SVG, 'logo.svg'),
      file(WAV, 'som.wav'),
      file(WOFF2, 'fonte.woff2'),
      file(OBJ, 'cubo.obj'),
      file(PNG_1PX, 'falso.jpg'),
      file(SVG, 'script.exe'),
    ]);
    expect(res.map((r) => r.status)).toEqual(['created', 'created', 'created', 'created', 'created', 'error', 'error']);
    const all = await queryAssets({ sort: 'name' });
    expect(all.map((a) => [a.name, a.kind, a.category])).toEqual([
      ['cubo', 'model3d', 'models3d'],
      ['fonte', 'font', 'fonts'],
      ['foto', 'image', 'images'],
      ['logo', 'vector', 'icons'],
      ['som', 'audio', 'audio'],
    ]);
  });

  it('enforces the size limit', async () => {
    const r = await importAssetFile(file(PNG_1PX, 'a.png'), { maxSizeBytes: 10 });
    expect(r.status).toBe('error');
  });

  it('deduplicates identical content and links to project', async () => {
    const p = await createProject({ name: 'p', category: 'web' });
    const a = await importAssetFile(file(PNG_1PX, 'a.png'));
    const b = await importAssetFile(file(PNG_1PX, 'b.png'), { projectId: p.id });
    expect(b.status).toBe('duplicate');
    expect(b.status !== 'error' && a.status !== 'error' && b.asset.id === a.asset.id).toBe(true);
    expect(await db.assets.count()).toBe(1);
    expect((await queryAssets({ projectId: p.id })).length).toBe(1);
  });

  it('duplicates share bytes and bytes are garbage-collected on delete', async () => {
    const r = await importAssetFile(file(PNG_1PX, 'a.png'));
    if (r.status === 'error') throw new Error(r.error);
    const copy = await duplicateAsset(r.asset.id);
    expect(copy.name).toBe('a (cópia)');
    expect(await db.assetData.count()).toBe(1);
    expect((await libraryStats())).toMatchObject({ count: 2, bytes: PNG_1PX.length, logicalBytes: PNG_1PX.length * 2 });
    await deleteAssets([r.asset.id]);
    expect(await db.assetData.count()).toBe(1);
    expect(new Uint8Array((await getAssetBytes(copy.id))!)).toEqual(PNG_1PX);
    await deleteAssets([copy.id]);
    expect(await db.assetData.count()).toBe(0);
  });

  it('renames, tags, favorites, filters and searches', async () => {
    const r1 = await importAssetFile(file(PNG_1PX, 'heroi.png'));
    const r2 = await importAssetFile(file(PNG_OTHER, 'espada.png'));
    if (r1.status === 'error' || r2.status === 'error') throw new Error('import');
    await updateAsset(r1.asset.id, { name: 'Herói principal', category: 'characters', tags: ['RPG', 'rpg', ' Heroi '], favorite: true });
    await updateAsset(r2.asset.id, { category: 'weapons', tags: ['rpg'] });
    expect(await listAllTags()).toEqual(['heroi', 'rpg']);
    expect((await queryAssets({ tag: 'heroi' })).map((a) => a.name)).toEqual(['Herói principal']);
    expect((await queryAssets({ favorite: true })).length).toBe(1);
    expect((await queryAssets({ category: 'weapons' })).map((a) => a.name)).toEqual(['espada']);
    expect((await queryAssets({ text: 'herói' })).length).toBe(1);
    // @ts-expect-error invalid on purpose
    await expect(updateAsset(r1.asset.id, { category: 'xx' })).rejects.toThrow();
  });

  it('manages folders without losing content', async () => {
    const a = await createFolder('Personagens');
    const b = await createFolder('Heróis', a.id);
    const r = await importAssetFile(file(PNG_1PX, 'x.png'), { folderId: b.id });
    if (r.status === 'error') throw new Error(r.error);
    expect((await queryAssets({ folderId: b.id })).length).toBe(1);
    await expect(moveFolder(a.id, b.id)).rejects.toThrow(/dentro dela mesma/);
    await deleteFolder(b.id);
    expect((await db.assets.get(r.asset.id))!.folderId).toBe(a.id);
    await deleteFolder(a.id);
    expect((await db.assets.get(r.asset.id))!.folderId).toBeNull();
    expect(await db.folders.count()).toBe(0);
  });

  it('keeps assets but removes links when a project is deleted', async () => {
    const p = await createProject({ name: 'p', category: 'web' });
    const r = await importAssetFile(file(PNG_1PX, 'x.png'));
    if (r.status === 'error') throw new Error(r.error);
    await linkAssetToProject(r.asset.id, p.id);
    await linkAssetToProject(r.asset.id, p.id);
    expect((await db.assets.get(r.asset.id))!.projectIds).toEqual([p.id]);
    await deleteProject(p.id);
    expect((await db.assets.get(r.asset.id))!.projectIds).toEqual([]);
  });

  it('exports a ZIP with files and manifest', async () => {
    const r = await importAssetFile(file(SVG, 'logo.svg'));
    if (r.status === 'error') throw new Error(r.error);
    const zip = await JSZip.loadAsync(await exportAssetsZip([r.asset.id]));
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.assets[0]).toMatchObject({ name: 'logo', kind: 'vector' });
    expect(await zip.file(manifest.assets[0].file)!.async('string')).toContain('<svg');
  });
});

describe('asset package import', () => {
  it('re-imports an exported package (deduplicating) and plain ZIPs', async () => {
    const { importAssetsZip } = await import('./assetService');
    const r = await importAssetFile(file(SVG, 'logo.svg'), { tags: ['marca'] });
    if (r.status === 'error') throw new Error(r.error);
    const zipBlob = await exportAssetsZip([r.asset.id]);
    expect((await importAssetsZip(zipBlob)).map((x) => x.status)).toEqual(['duplicate']);
    await Promise.all(db.tables.map((t) => t.clear()));
    const res = await importAssetsZip(zipBlob);
    expect(res[0].status).toBe('created');
    expect(res[0].status !== 'error' && res[0].asset.tags).toEqual(['marca']);
    const plain = new JSZip();
    plain.file('pasta/a.png', PNG_OTHER);
    plain.file('leia.txt', 'x');
    const res2 = await importAssetsZip(await plain.generateAsync({ type: 'blob' }));
    expect(res2.map((x) => x.status)).toEqual(['created']);
  });
});

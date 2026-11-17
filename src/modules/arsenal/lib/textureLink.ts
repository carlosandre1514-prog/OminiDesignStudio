import { db } from '@/core/db/database';
import type { Slot } from '@/modules/studio-3d/weapons/catalog';
import type { TextureMaps } from '@/modules/texture-studio/engine/compose';

/**
 * Bridge between the Arsenal and the Texture Studio: list the user's texture projects and
 * evaluate one into PBR maps (cached by project + last update) to dress a weapon slot.
 */
export interface TextureProject {
  id: string;
  name: string;
  updatedAt: number;
  thumbnail?: string;
}

export const SLOT_LABELS: Partial<Record<Slot, string>> = {
  anodized: 'Alumínio (receptores)',
  polymer: 'Polímero',
  dark: 'Aço escuro',
  metal: 'Metal',
  blade: 'Lâmina',
  bright: 'Aço claro',
  trim: 'Detalhes',
  wood: 'Madeira',
  grip: 'Empunhadura',
};

export async function listTextureProjects(): Promise<TextureProject[]> {
  const docs = await db.documents.toArray();
  const ids = docs.filter((d) => d.modules && d.modules['texture-studio']).map((d) => d.projectId);
  const metas = await db.projects.bulkGet(ids);
  return metas
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ id: m.id, name: m.name, updatedAt: m.updatedAt, thumbnail: m.thumbnail }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

const cache = new Map<string, Promise<TextureMaps>>();

/** Evaluate a texture project's stack (512 px) — cached until the project changes. */
export async function textureProjectMaps(id: string, size = 512): Promise<TextureMaps> {
  const doc = await db.documents.get(id);
  const meta = await db.projects.get(id);
  if (!doc?.modules['texture-studio']) throw new Error('Textura não encontrada');
  const key = `${id}|${meta?.updatedAt ?? doc.updatedAt}|${size}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const [{ normalizeTextureDoc }, { render }] = await Promise.all([import('@/modules/texture-studio/engine/types'), import('@/modules/texture-studio/engine/runner')]);
      return render(normalizeTextureDoc(doc.modules['texture-studio']), size);
    })();
    if (cache.size > 12) cache.clear();
    cache.set(key, p);
  }
  return p;
}

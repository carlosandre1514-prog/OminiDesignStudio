export type AssetKind = 'image' | 'vector' | 'audio' | 'font' | 'model3d' | 'component' | 'hdri';

export type AssetCategory =
  | 'models3d'
  | 'characters'
  | 'weapons'
  | 'scenery'
  | 'textures'
  | 'materials'
  | 'images'
  | 'icons'
  | 'fonts'
  | 'audio'
  | 'animations'
  | 'sprites'
  | 'prefabs'
  | 'components';

export const ASSET_CATEGORIES: { id: AssetCategory; label: string }[] = [
  { id: 'models3d', label: 'Modelos 3D' },
  { id: 'characters', label: 'Personagens' },
  { id: 'weapons', label: 'Armas e equipamentos' },
  { id: 'scenery', label: 'Cenários' },
  { id: 'textures', label: 'Texturas' },
  { id: 'materials', label: 'Materiais' },
  { id: 'images', label: 'Imagens' },
  { id: 'icons', label: 'Ícones' },
  { id: 'fonts', label: 'Fontes' },
  { id: 'audio', label: 'Áudios' },
  { id: 'animations', label: 'Animações' },
  { id: 'sprites', label: 'Sprites' },
  { id: 'prefabs', label: 'Prefabs' },
  { id: 'components', label: 'Componentes' },
];

export const KIND_LABELS: Record<AssetKind, string> = {
  image: 'Imagem',
  vector: 'Vetor',
  audio: 'Áudio',
  font: 'Fonte',
  model3d: 'Modelo 3D',
  component: 'Componente de UI',
  hdri: 'Ambiente HDRI',
};

export interface AssetMeta {
  width?: number;
  height?: number;
  /** seconds */
  duration?: number;
}

/** Library entry. The bytes live in `assetData`, keyed by content hash, so duplicates share storage. */
export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  category: AssetCategory;
  mime: string;
  ext: string;
  size: number;
  /** SHA-256 of the content (hex). */
  hash: string;
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  /** Projects this asset is linked to. */
  projectIds: string[];
  /** Small raster preview (data URL) for images/vectors. */
  thumbnail?: string;
  meta: AssetMeta;
  originalName: string;
  createdAt: number;
  updatedAt: number;
}

export interface AssetData {
  hash: string;
  /** Stored as ArrayBuffer (not Blob) for the widest IndexedDB compatibility. */
  data: ArrayBuffer;
  mime: string;
}

export interface AssetFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

/** URI used inside project documents to reference a library asset. */
export const ASSET_URI_PREFIX = 'asset:';
export const assetUri = (id: string) => `${ASSET_URI_PREFIX}${id}`;
export const parseAssetUri = (v: unknown): string | null =>
  typeof v === 'string' && v.startsWith(ASSET_URI_PREFIX) ? v.slice(ASSET_URI_PREFIX.length) : null;

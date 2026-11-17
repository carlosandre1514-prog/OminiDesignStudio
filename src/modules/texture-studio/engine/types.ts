import { createId } from '@/core/utils/id';
import { defaultGenParams, type Params } from './generators';

/**
 * Texture document: a Substance-style layer stack evaluated into PBR maps.
 * Each layer has a content (what it paints) and a mask (where it paints).
 */

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'add' | 'softlight' | 'darken' | 'lighten';
export type HeightMode = 'normal' | 'add' | 'subtract' | 'max' | 'min';

export interface PatternRef {
  gen: string;
  params: Params;
  /** Remap of the pattern value: [low, high] → [0, 1]. */
  low: number;
  high: number;
  invert: boolean;
}

export interface LayerChannels {
  color: boolean;
  height: boolean;
  roughness: boolean;
  metal: boolean;
  emissive: boolean;
}

export interface LayerContent {
  /** Pattern driving the gradient/height/roughness variation (null = uniform). */
  pattern: PatternRef | null;
  /** Colour gradient stops (sRGB hex), mapped by the pattern value. One stop = solid colour. */
  colors: string[];
  /** Quantise the gradient (camouflage, decals). */
  stepped: boolean;
  /** Optional image (Asset Library id) used as colour, tiled. */
  imageId?: string;
  /** Optional grayscale height image (Asset Library id): drives relief/roughness instead of the pattern. */
  heightImageId?: string;
  roughA: number;
  roughB: number;
  metalA: number;
  metalB: number;
  /** Height contributed = heightOffset + value × heightAmount (0..1 scale). */
  heightAmount: number;
  heightOffset: number;
  emissive: string;
  emissiveIntensity: number;
}

export type MaskKind = 'none' | 'pattern' | 'paint' | 'text' | 'image' | 'curvature' | 'height';

export interface TextMask {
  text: string;
  font: string;
  size: number; // fraction of the texture height
  x: number; // 0..1 centre
  y: number;
  rotation: number; // degrees
  bold: boolean;
  /** Repeat the text as a grid (serial numbers, logos). */
  repeat: number;
}

export interface LayerMask {
  kind: MaskKind;
  pattern: PatternRef | null;
  /** PNG data URL of the painted mask (grayscale in R). */
  paint?: string;
  text?: TextMask;
  imageId?: string;
  /** curvature / height masks: which side and how wide. */
  side: 'convex' | 'concave' | 'high' | 'low';
  amount: number;
  invert: boolean;
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  heightMode: HeightMode;
  channels: LayerChannels;
  content: LayerContent;
  mask: LayerMask;
}

export interface TextureDoc {
  version: 1;
  name: string;
  /** Export resolution (preview uses a lower one). */
  resolution: 512 | 1024 | 2048;
  normalStrength: number;
  normalFormat: 'opengl' | 'directx';
  aoStrength: number;
  /** Repeat count used in the 3D preview. */
  previewTiling: number;
  previewShape: 'sphere' | 'cube' | 'plane' | 'cylinder' | 'rifle';
  layers: Layer[];
}

export const BLEND_LABELS: Record<BlendMode, string> = {
  normal: 'Normal',
  multiply: 'Multiplicar',
  screen: 'Tela',
  overlay: 'Sobrepor',
  add: 'Adicionar',
  softlight: 'Luz suave',
  darken: 'Escurecer',
  lighten: 'Clarear',
};
export const HEIGHT_LABELS: Record<HeightMode, string> = { normal: 'Substituir', add: 'Somar', subtract: 'Subtrair', max: 'Máximo', min: 'Mínimo' };
export const MASK_LABELS: Record<MaskKind, string> = {
  none: 'Sem máscara',
  pattern: 'Padrão procedural',
  paint: 'Pintura (pincel)',
  text: 'Texto / decalque',
  image: 'Imagem da biblioteca',
  curvature: 'Curvatura (bordas/cavidades)',
  height: 'Altura (picos/vales)',
};

export const pattern = (gen: string, params: Params = {}, low = 0, high = 1, invert = false): PatternRef => ({ gen, params: { ...defaultGenParams(gen), ...params }, low, high, invert });

export function createLayer(name = 'Camada', patch: Partial<Omit<Layer, 'content' | 'mask' | 'channels'>> & { content?: Partial<LayerContent>; mask?: Partial<LayerMask>; channels?: Partial<LayerChannels> } = {}): Layer {
  const { content, mask, channels, ...rest } = patch;
  return {
    id: createId('lyr'),
    name,
    visible: true,
    opacity: 1,
    blend: 'normal',
    heightMode: 'add',
    ...rest,
    channels: { color: true, height: true, roughness: true, metal: true, emissive: false, ...channels },
    content: {
      pattern: null,
      colors: ['#808080'],
      stepped: false,
      roughA: 0.5,
      roughB: 0.5,
      metalA: 0,
      metalB: 0,
      heightAmount: 0,
      heightOffset: 0,
      emissive: '#000000',
      emissiveIntensity: 0,
      ...content,
    },
    mask: { kind: 'none', pattern: null, side: 'convex', amount: 0.5, invert: false, ...mask },
  };
}

export function createTextureDoc(name = 'Nova textura', layers?: Layer[]): TextureDoc {
  return {
    version: 1,
    name,
    resolution: 1024,
    normalStrength: 1,
    normalFormat: 'opengl',
    aoStrength: 0.7,
    previewTiling: 1,
    previewShape: 'sphere',
    layers: layers ?? [createLayer('Base', { heightMode: 'normal', content: { colors: ['#8a8d92'], roughA: 0.45, roughB: 0.45, metalA: 1, metalB: 1 } })],
  };
}

/** Accept older/partial documents (cloud, imports). */
export function normalizeTextureDoc(raw: unknown): TextureDoc {
  const d = (raw ?? {}) as Partial<TextureDoc>;
  const base = createTextureDoc(d.name);
  return {
    ...base,
    ...d,
    version: 1,
    layers: Array.isArray(d.layers) && d.layers.length ? d.layers.map((l) => createLayer(l.name, l)) : base.layers,
  };
}

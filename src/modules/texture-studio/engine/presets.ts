import { createLayer, createTextureDoc, pattern, type Layer, type TextureDoc } from './types';

/**
 * Smart materials: ready-made layer stacks that start a texture. Every layer stays editable.
 * Values are physically plausible (metals: metallic 1 with coloured base; dielectrics: metallic 0).
 */
export interface Preset {
  id: string;
  name: string;
  group: 'Metais' | 'Revestimentos' | 'Orgânicos' | 'Sintéticos' | 'Sci-fi' | 'Pele e personagens' | 'Animais';
  /** Shading model the preset is made for (skin = subsurface scattering). */
  surface?: 'standard' | 'skin';
  build(): Layer[];
}

/** Human skin: base tone with blood/melanin variation, pores, micro wrinkles, freckles, blemishes, scars to paint. */
function skin(tone: [string, string], blush: string, freckles: number, spots: string): Layer[] {
  return [
    L('Pele', { heightMode: 'normal', content: { colors: tone, pattern: P('noise', { scale: 5, octaves: 5 }), roughA: 0.5, roughB: 0.42, metalA: 0, metalB: 0 } }),
    L('Poros e microrrugas', { blend: 'multiply', opacity: 0.55, channels: { metal: false }, content: { colors: ['#b98f80', '#ffffff'], pattern: P('skin-pores'), roughA: 0.62, roughB: 0.4, heightAmount: 0.05 } }),
    L('Vermelhidão (sangue sob a pele)', { blend: 'multiply', opacity: 0.35, channels: { height: false, metal: false, roughness: false }, content: { colors: [blush] }, mask: { kind: 'pattern', pattern: P('grunge', { scale: 3, coverage: 0.45, sharpness: 2 }) } }),
    L('Sardas e pintas', { blend: 'multiply', opacity: freckles, channels: { height: false, metal: false, roughness: false }, content: { colors: [spots] }, mask: { kind: 'pattern', pattern: P('freckles') } }),
    L('Oleosidade (testa/nariz — pinte)', { channels: { color: false, height: false, metal: false }, content: { colors: ['#ffffff'], roughA: 0.28, roughB: 0.28 }, opacity: 0.8, mask: { kind: 'paint' } }),
    L('Cicatrizes (pinte)', { channels: { metal: false }, content: { colors: ['#c98f86', '#e2b0a6'], pattern: P('wrinkles', { scale: 10, stretch: 4 }), roughA: 0.35, roughB: 0.3, heightOffset: 0.03, heightAmount: -0.02 }, mask: { kind: 'paint' } }),
    L('Sujeira', { blend: 'multiply', opacity: 0, channels: { height: false, metal: false }, content: { colors: ['#6b5a49'], roughA: 0.8, roughB: 0.8 }, mask: { kind: 'curvature', side: 'concave', amount: 0.5, pattern: P('grunge', { scale: 5, coverage: 0.5 }) } }),
  ];
}

const L = createLayer;
const P = pattern;

export const PRESETS: Preset[] = [
  {
    id: 'brushed-steel',
    name: 'Aço escovado',
    group: 'Metais',
    build: () => [
      L('Aço', { heightMode: 'normal', content: { colors: ['#a7abb1', '#c9ccd1'], pattern: P('brushed'), roughA: 0.42, roughB: 0.22, metalA: 1, metalB: 1, heightAmount: 0.02 } }),
      L('Variação', { blend: 'multiply', opacity: 0.35, channels: { height: false, metal: false }, content: { colors: ['#9a9da3', '#ffffff'], pattern: P('noise', { scale: 3 }), roughA: 0.5, roughB: 0.3 } }),
      L('Arranhões finos', { channels: { metal: false }, content: { colors: ['#e3e6ea'], roughA: 0.15, roughB: 0.15, heightOffset: -0.01 }, mask: { kind: 'pattern', pattern: P('scratches', { count: 160, angle: 0, variance: 25 }) } }),
    ],
  },
  {
    id: 'cerakote-black',
    name: 'Cerakote preto com desgaste',
    group: 'Revestimentos',
    build: () => [
      L('Aço por baixo', { heightMode: 'normal', content: { colors: ['#9da1a7'], roughA: 0.3, roughB: 0.3, metalA: 1, metalB: 1 } }),
      L('Cerakote', { content: { colors: ['#1b1c1e', '#232427'], pattern: P('noise', { scale: 12, octaves: 3 }), roughA: 0.62, roughB: 0.7, metalA: 0, metalB: 0, heightOffset: 0.03, heightAmount: 0.01 }, mask: { kind: 'pattern', pattern: P('grunge', { scale: 5, coverage: 0.12, sharpness: 8 }, 0, 1, true) } }),
      L('Arranhões', { channels: { height: false }, content: { colors: ['#b9bdc3'], roughA: 0.25, roughB: 0.25, metalA: 1, metalB: 1 }, mask: { kind: 'pattern', pattern: P('scratches', { count: 90, length: 0.08, variance: 140 }) } }),
      L('Poeira nas cavidades', { blend: 'multiply', channels: { height: false, metal: false }, opacity: 0.6, content: { colors: ['#6f6556'], roughA: 0.9, roughB: 0.9 }, mask: { kind: 'curvature', side: 'concave', amount: 0.5 } }),
    ],
  },
  {
    id: 'anodized',
    name: 'Alumínio anodizado',
    group: 'Metais',
    build: () => [
      L('Anodizado', { heightMode: 'normal', content: { colors: ['#2d3440', '#353d4b'], pattern: P('noise', { scale: 6, octaves: 3 }), roughA: 0.38, roughB: 0.45, metalA: 1, metalB: 1 } }),
      L('Micro textura', { channels: { color: false, metal: false }, content: { pattern: P('noise', { scale: 32, octaves: 2 }), roughA: 0.35, roughB: 0.5, heightAmount: 0.01 } }),
      L('Bordas gastas', { channels: { height: false }, content: { colors: ['#c3c7cd'], roughA: 0.25, roughB: 0.25, metalA: 1, metalB: 1 }, mask: { kind: 'pattern', pattern: P('scratches', { count: 60, length: 0.05, width: 0.001 }) } }),
    ],
  },
  {
    id: 'polymer',
    name: 'Polímero texturizado',
    group: 'Sintéticos',
    build: () => [
      L('Polímero', { heightMode: 'normal', content: { colors: ['#202123', '#2a2b2e'], pattern: P('noise', { scale: 8, octaves: 3 }), roughA: 0.6, roughB: 0.72, metalA: 0, metalB: 0 } }),
      L('Pontilhado', { channels: { color: false, metal: false }, content: { pattern: P('cells', { scale: 48, mode: 'f1' }, 0, 0.7, true), roughA: 0.75, roughB: 0.55, heightAmount: 0.035 } }),
      L('Desgaste claro', { channels: { height: false, metal: false }, opacity: 0.7, content: { colors: ['#4a4b4f'], roughA: 0.45, roughB: 0.45 }, mask: { kind: 'curvature', side: 'convex', amount: 0.6 } }),
    ],
  },
  {
    id: 'carbon',
    name: 'Fibra de carbono',
    group: 'Sintéticos',
    build: () => [
      L('Trama', { heightMode: 'normal', content: { colors: ['#0d0e10', '#3a3d42'], pattern: P('carbon', { scale: 16 }), roughA: 0.4, roughB: 0.3, metalA: 0, metalB: 0, heightAmount: 0.02 } }),
      L('Verniz', { channels: { color: false, metal: false, height: false }, content: { roughA: 0.12, roughB: 0.12 }, opacity: 0.6 }),
    ],
  },
  {
    id: 'walnut',
    name: 'Nogueira envernizada',
    group: 'Orgânicos',
    build: () => [
      L('Madeira', { heightMode: 'normal', content: { colors: ['#3a2416', '#6b4429', '#8a5a36'], pattern: P('wood', { rings: 9, warp: 1.4 }), roughA: 0.5, roughB: 0.35, metalA: 0, metalB: 0, heightAmount: 0.02 } }),
      L('Poros', { channels: { color: false, metal: false }, content: { pattern: P('noise', { scale: 6, stretch: 16, octaves: 3 }), roughA: 0.3, roughB: 0.55, heightAmount: -0.015 } }),
      L('Verniz gasto', { channels: { color: false, height: false, metal: false }, content: { roughA: 0.18, roughB: 0.18 }, mask: { kind: 'pattern', pattern: P('grunge', { coverage: 0.6 }) } }),
    ],
  },
  {
    id: 'leather',
    name: 'Couro marrom',
    group: 'Orgânicos',
    build: () => [
      L('Couro', { heightMode: 'normal', content: { colors: ['#3b2216', '#5a3523'], pattern: P('leather', { scale: 40 }), roughA: 0.75, roughB: 0.55, metalA: 0, metalB: 0, heightAmount: 0.04 } }),
      L('Manchas', { blend: 'multiply', channels: { height: false, metal: false }, opacity: 0.5, content: { colors: ['#7d6a5c'], roughA: 0.8, roughB: 0.8 }, mask: { kind: 'pattern', pattern: P('spots', { coverage: 0.35, softness: 0.3 }) } }),
    ],
  },
  {
    id: 'knurled-steel',
    name: 'Aço recartilhado',
    group: 'Metais',
    build: () => [
      L('Aço', { heightMode: 'normal', content: { colors: ['#5d6066', '#9a9ea4'], pattern: P('knurling', { scale: 48 }), roughA: 0.5, roughB: 0.3, metalA: 1, metalB: 1, heightAmount: 0.06 } }),
      L('Oxidação', { blend: 'multiply', channels: { height: false }, opacity: 0.5, content: { colors: ['#3c3530'], roughA: 0.7, roughB: 0.7, metalA: 0.6, metalB: 0.6 }, mask: { kind: 'curvature', side: 'concave', amount: 0.6 } }),
    ],
  },
  {
    id: 'aged-brass',
    name: 'Latão envelhecido',
    group: 'Metais',
    build: () => [
      L('Latão', { heightMode: 'normal', content: { colors: ['#b48a3c', '#d6ae5e'], pattern: P('noise', { scale: 5 }), roughA: 0.35, roughB: 0.22, metalA: 1, metalB: 1 } }),
      L('Pátina', { channels: { height: false }, content: { colors: ['#4f5a3e', '#6a6040'], pattern: P('noise', { scale: 10 }), roughA: 0.8, roughB: 0.7, metalA: 0.2, metalB: 0.2 }, mask: { kind: 'pattern', pattern: P('grunge', { coverage: 0.35, scale: 4 }) } }),
      L('Polido nas bordas', { channels: { height: false }, content: { colors: ['#f0cf86'], roughA: 0.15, roughB: 0.15, metalA: 1, metalB: 1 }, mask: { kind: 'pattern', pattern: P('scratches', { count: 50 }) } }),
    ],
  },
  {
    id: 'rusty',
    name: 'Aço enferrujado',
    group: 'Metais',
    build: () => [
      L('Aço', { heightMode: 'normal', content: { colors: ['#7b7f84'], roughA: 0.45, roughB: 0.45, metalA: 1, metalB: 1 } }),
      L('Ferrugem', { content: { colors: ['#4a2614', '#8a4a20', '#b5703a'], pattern: P('noise', { scale: 10, octaves: 6 }), roughA: 0.95, roughB: 0.8, metalA: 0, metalB: 0, heightOffset: 0.02, heightAmount: 0.05 }, mask: { kind: 'pattern', pattern: P('rust', { coverage: 0.55 }) } }),
      L('Pites', { channels: { color: false, metal: false, roughness: false }, content: { pattern: P('cells', { scale: 40 }, 0, 0.35, true), heightAmount: -0.03 }, mask: { kind: 'pattern', pattern: P('rust', { coverage: 0.55 }) } }),
    ],
  },
  {
    id: 'woodland',
    name: 'Camuflagem woodland',
    group: 'Revestimentos',
    build: () => [
      L('Base polímero', { heightMode: 'normal', content: { colors: ['#262725'], pattern: P('noise', { scale: 24, octaves: 2 }), roughA: 0.6, roughB: 0.7, heightAmount: 0.01 } }),
      L('Camuflagem', { channels: { height: false, metal: false }, content: { colors: ['#4b5a32', '#2f3a22', '#6b5638', '#1a1a17'], stepped: true, pattern: P('camo', { style: 'woodland', levels: 4 }), roughA: 0.65, roughB: 0.65 } }),
      L('Desgaste', { channels: { height: false }, content: { colors: ['#9fa3a8'], roughA: 0.3, roughB: 0.3, metalA: 1, metalB: 1 }, mask: { kind: 'pattern', pattern: P('scratches', { count: 70, variance: 160 }) } }),
    ],
  },
  {
    id: 'diamond-plate',
    name: 'Chapa xadrez',
    group: 'Metais',
    build: () => [
      L('Chapa', { heightMode: 'normal', content: { colors: ['#8c9096', '#b8bcc2'], pattern: P('diamond-plate', { scale: 8 }), roughA: 0.45, roughB: 0.3, metalA: 1, metalB: 1, heightAmount: 0.12 } }),
      L('Sujeira', { blend: 'multiply', channels: { height: false, metal: false }, opacity: 0.6, content: { colors: ['#5a5348'], roughA: 0.85, roughB: 0.85 }, mask: { kind: 'curvature', side: 'concave', amount: 0.4 } }),
    ],
  },
  {
    id: 'scifi-panels',
    name: 'Painéis sci-fi',
    group: 'Sci-fi',
    build: () => [
      L('Painéis', { heightMode: 'normal', content: { colors: ['#4a4f58', '#6b717c'], pattern: P('plates', { cols: 4, rows: 4, gap: 0.01, bevel: 0.03, offset: 0.5 }), roughA: 0.6, roughB: 0.35, metalA: 1, metalB: 1, heightAmount: 0.15 } }),
      L('Rebites', { channels: { color: false }, content: { pattern: P('dots', { count: 16, radius: 0.12 }), roughA: 0.4, roughB: 0.3, metalA: 1, metalB: 1, heightAmount: 0.05 } }),
      L('Luzes', { channels: { color: true, emissive: true, height: false, roughness: false, metal: false }, content: { colors: ['#38d6ff'], emissive: '#38d6ff', emissiveIntensity: 1 }, mask: { kind: 'pattern', pattern: P('stripes', { count: 4, width: 0.04, dir: 'h', soft: 0.01 }) } }),
    ],
  },
  {
    id: 'energy-hex',
    name: 'Escudo de energia (hex)',
    group: 'Sci-fi',
    build: () => [
      L('Base', { heightMode: 'normal', content: { colors: ['#0e1726'], roughA: 0.3, roughB: 0.3, metalA: 0.5, metalB: 0.5 } }),
      L('Hexágonos', { channels: { emissive: true }, content: { colors: ['#123049', '#2ab3ff'], pattern: P('hex', { scale: 10, gap: 0.08 }, 0, 1, true), emissive: '#2ab3ff', emissiveIntensity: 1, heightAmount: -0.05, roughA: 0.3, roughB: 0.2 } }),
    ],
  },
  {
    id: 'cordura',
    name: 'Tecido tático (cordura)',
    group: 'Sintéticos',
    build: () => [
      L('Trama', { heightMode: 'normal', content: { colors: ['#3c4130', '#525842'], pattern: P('weave', { scale: 64 }), roughA: 0.95, roughB: 0.8, heightAmount: 0.05 } }),
      L('Variação', { blend: 'multiply', channels: { height: false, metal: false }, opacity: 0.4, content: { colors: ['#8d8f80', '#ffffff'], pattern: P('noise', { scale: 4 }) } }),
    ],
  },
  {
    id: 'damascus',
    name: 'Aço damasco',
    group: 'Metais',
    build: () => [
      L('Camadas', { heightMode: 'normal', content: { colors: ['#4a4c50', '#c5c8cc'], pattern: P('wood', { rings: 22, warp: 2.4, grain: 32 }, 0.35, 0.75), roughA: 0.45, roughB: 0.2, metalA: 1, metalB: 1, heightAmount: 0.01 } }),
    ],
  },
  // ------------------------------------------------------------ for painted models (geometry-aware wear)
  {
    id: 'gun-edge-wear',
    name: 'Arma: cerakote + quinas gastas (modelo 3D)',
    group: 'Revestimentos',
    build: () => [
      L('Aço por baixo', { heightMode: 'normal', content: { colors: ['#8d9298', '#b4b8bd'], pattern: P('brushed'), roughA: 0.35, roughB: 0.25, metalA: 1, metalB: 1 } }),
      L('Cerakote', { content: { colors: ['#17181a', '#222326'], pattern: P('noise', { scale: 16, octaves: 3 }), roughA: 0.6, roughB: 0.7, metalA: 0, metalB: 0, heightOffset: 0.02, heightAmount: 0.006 } }),
      L('Quinas gastas', { channels: { height: false }, content: { colors: ['#9ea3a9', '#c5c9ce'], pattern: P('brushed'), roughA: 0.3, roughB: 0.22, metalA: 1, metalB: 1 }, mask: { kind: 'curvature', side: 'convex', amount: 0.26, pattern: P('grunge', { scale: 6, coverage: 0.5, sharpness: 3 }) } }),
      L('Arranhões finos', { channels: { height: false }, opacity: 0.7, content: { colors: ['#a9adb3'], roughA: 0.3, roughB: 0.3, metalA: 1, metalB: 1 }, mask: { kind: 'pattern', pattern: P('scratches', { count: 60, length: 0.06, width: 0.001, variance: 160 }) } }),
      L('Poeira nos cantos', { blend: 'multiply', channels: { height: false, metal: false }, opacity: 0.7, content: { colors: ['#7a6e5c'], roughA: 0.9, roughB: 0.9 }, mask: { kind: 'curvature', side: 'concave', amount: 0.5 } }),
      L('Manchas de mão (pinte)', { channels: { color: false, height: false, metal: false }, content: { colors: ['#ffffff'], roughA: 0.35, roughB: 0.35 }, mask: { kind: 'paint' } }),
    ],
  },
  // ------------------------------------------------------------ skin & characters
  { id: 'skin-light', name: 'Pele clara (sardas)', group: 'Pele e personagens', surface: 'skin', build: () => skin(['#e2b49c', '#f0c8b2'], '#e08a80', 0.55, '#b27552') },
  { id: 'skin-medium', name: 'Pele morena', group: 'Pele e personagens', surface: 'skin', build: () => skin(['#b07a58', '#c48d68'], '#c26a5c', 0.25, '#7a4a30') },
  { id: 'skin-dark', name: 'Pele negra', group: 'Pele e personagens', surface: 'skin', build: () => skin(['#5a3a2b', '#6b4535'], '#a06a5c', 0.15, '#3a2219') },
  {
    id: 'skin-aged',
    name: 'Pele envelhecida (rugas)',
    group: 'Pele e personagens',
    surface: 'skin',
    build: () => [
      ...skin(['#d2a28a', '#e0b39b'], '#cf7f74', 0.4, '#8f5d43'),
      L('Rugas', { blend: 'multiply', opacity: 0.6, channels: { metal: false }, content: { colors: ['#a77c6a', '#ffffff'], pattern: P('wrinkles', { scale: 5, stretch: 3, sharpness: 4 }, 0, 1, true), roughA: 0.5, roughB: 0.45, heightAmount: -0.04 } }),
    ],
  },
  // ------------------------------------------------------------ animals
  {
    id: 'reptile',
    name: 'Escamas de réptil',
    group: 'Animais',
    build: () => [
      L('Escamas', { heightMode: 'normal', content: { colors: ['#2f3a22', '#6d7a3e', '#9aa05a'], pattern: P('scales', { scale: 20, bevel: 0.3 }), roughA: 0.7, roughB: 0.45, heightAmount: 0.12 } }),
      L('Manchas', { blend: 'multiply', opacity: 0.7, channels: { height: false, metal: false }, content: { colors: ['#4a3a22'] }, mask: { kind: 'pattern', pattern: P('spots', { scale: 6, coverage: 0.4, softness: 0.15 }) } }),
      L('Brilho úmido', { channels: { color: false, height: false, metal: false }, content: { colors: ['#ffffff'], roughA: 0.25, roughB: 0.25 }, opacity: 0.5, mask: { kind: 'height', side: 'high', amount: 0.3 } }),
    ],
  },
  {
    id: 'croc',
    name: 'Couro de crocodilo',
    group: 'Animais',
    build: () => [
      L('Placas', { heightMode: 'normal', content: { colors: ['#2b2a1f', '#55523a', '#7a7552'], pattern: P('scales', { scale: 8, bevel: 0.45, irregular: 0.6 }), roughA: 0.75, roughB: 0.5, heightAmount: 0.18 } }),
      L('Sulcos escuros', { blend: 'multiply', channels: { height: false, metal: false }, content: { colors: ['#1b1a14'], roughA: 0.9, roughB: 0.9 }, mask: { kind: 'curvature', side: 'concave', amount: 0.6 } }),
    ],
  },
  {
    id: 'fish-scales',
    name: 'Escamas de peixe / cobra',
    group: 'Animais',
    build: () => [
      L('Escamas', { heightMode: 'normal', content: { colors: ['#3d4a52', '#9fb3bd', '#d8e4ea'], pattern: P('scales', { kind: 'fish', scale: 24, bevel: 0.25 }), roughA: 0.45, roughB: 0.2, metalA: 0.15, metalB: 0.35, heightAmount: 0.08 } }),
      L('Dorso escuro', { blend: 'multiply', opacity: 0.6, channels: { height: false, metal: false }, content: { colors: ['#4c5a5f', '#ffffff'], pattern: P('gradient') } }),
    ],
  },
  {
    id: 'tiger-fur',
    name: 'Pelo de tigre',
    group: 'Animais',
    build: () => [
      L('Pelos', { heightMode: 'normal', content: { colors: ['#9a4f16', '#e08a33', '#f2b766'], pattern: P('fur', { density: 48, length: 8 }), roughA: 0.85, roughB: 0.7, heightAmount: 0.06 } }),
      L('Listras', { channels: { height: false, metal: false }, content: { colors: ['#1a1410'], roughA: 0.8, roughB: 0.8 }, mask: { kind: 'pattern', pattern: P('animal-stripes', { count: 9, warp: 1.4, thickness: 0.35 }) } }),
    ],
  },
  {
    id: 'leopard-fur',
    name: 'Pelo de onça / leopardo',
    group: 'Animais',
    build: () => [
      L('Pelos', { heightMode: 'normal', content: { colors: ['#9b6a2c', '#d9a85c', '#ecc98c'], pattern: P('fur', { density: 56, length: 6 }), roughA: 0.85, roughB: 0.7, heightAmount: 0.05 } }),
      L('Rosetas', { channels: { height: false, metal: false }, content: { colors: ['#1f1710'], roughA: 0.8, roughB: 0.8 }, mask: { kind: 'pattern', pattern: P('rosettes') } }),
    ],
  },
  {
    id: 'wolf-fur',
    name: 'Pelo de lobo',
    group: 'Animais',
    build: () => [
      L('Pelos', { heightMode: 'normal', content: { colors: ['#2e2b28', '#7a7168', '#c9c0b4'], pattern: P('fur', { density: 40, length: 10, flow: 0.6, clumps: 0.7 }), roughA: 0.9, roughB: 0.75, heightAmount: 0.07 } }),
      L('Variação', { blend: 'multiply', opacity: 0.6, channels: { height: false, metal: false }, content: { colors: ['#6e5f50', '#ffffff'], pattern: P('noise', { scale: 3 }) } }),
    ],
  },
  {
    id: 'feathers',
    name: 'Penas',
    group: 'Animais',
    build: () => [L('Penas', { heightMode: 'normal', content: { colors: ['#3b2a1c', '#7d5a3a', '#cdb08a'], pattern: P('feathers'), roughA: 0.75, roughB: 0.55, heightAmount: 0.06 } })],
  },
  {
    id: 'horn',
    name: 'Chifre / casco',
    group: 'Animais',
    build: () => [
      L('Queratina', { heightMode: 'normal', content: { colors: ['#2d241c', '#6d5a44', '#c8b08a'], pattern: P('horn'), roughA: 0.55, roughB: 0.35, heightAmount: 0.05 } }),
      L('Pontas gastas', { channels: { height: false, metal: false }, content: { colors: ['#e2d3b4'], roughA: 0.3, roughB: 0.3 }, mask: { kind: 'curvature', side: 'convex', amount: 0.5 } }),
    ],
  },
];

export function docFromPreset(id: string, name?: string): TextureDoc {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { ...createTextureDoc(name ?? p.name, p.build()), surface: p.surface ?? 'standard' };
}

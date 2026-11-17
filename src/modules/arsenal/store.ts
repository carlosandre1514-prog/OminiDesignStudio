import { create } from 'zustand';
import { buildWeapon, defaultParams, randomParams, WEAPONS, type Params, type WeaponPart, type WeaponType } from '@/modules/studio-3d/weapons/catalog';
import { DEFAULT_FINISH, materialFor, texturesFor, type Finish } from '@/modules/studio-3d/weapons/textures';
import { parsePrompt, type CamoPattern } from './lib/promptParser';
import { silhouetteToMesh } from './lib/silhouette';
import type { PhotoTexture } from './lib/photo3d';

/** Weapon parts with a stable key (names can repeat across generations). */
export interface Part extends WeaponPart {
  key: string;
}

export type StatusKind = 'ready' | 'busy' | 'error';

export interface ArsenalState {
  // --- model
  weaponId: string;
  params: Params;
  seed: number;
  /** 'catalog' = procedural weapon type; 'image' = extruded silhouette from a picture. */
  source: 'catalog' | 'image';
  imagePart: WeaponPart | null;
  imageName: string;
  imageLength: number;
  /** 'foto' = AI photo → textured 3D; 'silhueta' = extruded outline. */
  imageMode: 'foto' | 'silhueta';
  useAI: boolean;
  /** Relief depth for photo → 3D (fraction of length). */
  relief: number;
  /** Photo texture of the current photo-based model. */
  photo: PhotoTexture | null;
  parts: Part[];
  // --- surface
  finish: Finish;
  camo: { pattern: CamoPattern; color: string };
  edgeWear: number;
  roughness: number;
  metalness: number;
  /** Texture Studio projects applied per material slot. */
  custom: Partial<Record<WeaponPart['slot'], { id: string; name: string }>>;
  /** Repeats of a custom texture per metre (tile = 1 / customScale m). */
  customScale: number;
  // --- inspector
  hidden: Record<string, boolean>;
  solo: string | null;
  explode: number;
  selected: string | null;
  // --- status / AI panel
  prompt: string;
  status: { kind: StatusKind; text: string };
  understood: string[];
  ignored: string[];
  stats: { fps: number; tris: number };

  set(p: Partial<ArsenalState>): void;
  setWeapon(id: string): void;
  setParam(key: string, value: number | string): void;
  setFinish(p: Partial<Finish>): void;
  randomize(): void;
  toggleHidden(key: string): void;
  generateFromPrompt(text: string): Promise<void>;
  generateFromImage(file: Blob, name: string): Promise<void>;
}

const frame = () => new Promise<void>((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => setTimeout(r, 0)) : setTimeout(r, 0)));

export const WEAPON_IDS = WEAPONS.map((w) => w.id);
export const weaponById = (id: string): WeaponType => WEAPONS.find((w) => w.id === id) ?? WEAPONS[0];

function partsFor(s: Pick<ArsenalState, 'source' | 'imagePart' | 'weaponId' | 'params' | 'seed'>): Part[] {
  const list = s.source === 'image' && s.imagePart ? [s.imagePart] : buildWeapon(weaponById(s.weaponId), s.params, s.seed);
  return list.map((p, i) => ({ ...p, key: `${i}:${p.name}` }));
}

/** Pre-compute the PBR textures used by the parts (cached), so the first frame doesn't stall. */
function warmTextures(parts: WeaponPart[], finish: Finish) {
  for (const p of parts) {
    const pat = materialFor(p.slot, finish).pattern;
    if (pat) texturesFor(pat, 256);
  }
}

const INITIAL = 'ar15-hd';

export const useArsenal = create<ArsenalState>((set, get) => {
  /** Rebuild parts after a model change and clear part-specific inspector state. */
  const rebuild = (patch: Partial<ArsenalState>) => {
    const next = { ...get(), ...patch };
    set({ ...patch, parts: partsFor(next), hidden: {}, solo: null, selected: null });
  };
  const initialParams = defaultParams(weaponById(INITIAL));
  return {
    weaponId: INITIAL,
    params: initialParams,
    seed: 1,
    source: 'catalog',
    imagePart: null,
    imageName: '',
    imageLength: 0.9,
    imageMode: 'foto',
    useAI: true,
    relief: 0.02,
    photo: null,
    parts: partsFor({ source: 'catalog', imagePart: null, weaponId: INITIAL, params: initialParams, seed: 1 }),
    finish: { ...DEFAULT_FINISH, ...weaponById(INITIAL).finish },
    camo: { pattern: 'nenhum', color: '#3a3d41' },
    edgeWear: weaponById(INITIAL).finish?.wear ?? 0.35,
    roughness: 1,
    metalness: 1,
    custom: {},
    customScale: 8,
    hidden: {},
    solo: null,
    explode: 0,
    selected: null,
    prompt: '',
    status: { kind: 'ready', text: 'Pronto' },
    understood: [],
    ignored: [],
    stats: { fps: 0, tris: 0 },

    set: (p) => set(p),
    setWeapon: (id) => {
      const w = weaponById(id);
      rebuild({ weaponId: id, params: defaultParams(w), seed: 1, source: 'catalog', ...(w.finish ? { finish: { ...DEFAULT_FINISH, ...w.finish }, edgeWear: w.finish.wear ?? get().edgeWear } : {}) });
    },
    setParam: (key, value) => {
      const params = { ...get().params, [key]: value };
      const next = { ...get(), params };
      // Keep visibility state when only shape sliders change.
      set({ params, parts: partsFor(next) });
    },
    setFinish: (p) => set({ finish: { ...get().finish, ...p } }),
    randomize: () => {
      const seed = Math.floor(Math.random() * 1e9) + 1;
      rebuild({ seed, params: randomParams(weaponById(get().weaponId), seed), source: 'catalog' });
    },
    toggleHidden: (key) => set({ hidden: { ...get().hidden, [key]: !get().hidden[key] } }),

    async generateFromPrompt(text) {
      if (!text.trim()) return;
      set({ status: { kind: 'busy', text: 'Interpretando prompt…' }, prompt: text });
      await frame();
      const r = parsePrompt(text, get().weaponId);
      set({ status: { kind: 'busy', text: 'Gerando malha Hard-Surface…' } });
      await frame();
      const parts = partsFor({ source: 'catalog', imagePart: null, weaponId: r.weapon.id, params: r.params, seed: get().seed });
      set({ status: { kind: 'busy', text: 'Sintetizando texturas PBR…' } });
      await frame();
      warmTextures(parts, r.finish);
      set({
        weaponId: r.weapon.id,
        params: r.params,
        source: 'catalog',
        parts,
        finish: r.finish,
        camo: r.camo ? { pattern: r.camo.pattern, color: r.camo.color ?? get().camo.color } : { ...get().camo, pattern: 'nenhum' },
        edgeWear: r.finish.wear,
        understood: r.understood,
        ignored: r.ignored,
        hidden: {},
        solo: null,
        selected: null,
        status: { kind: 'ready', text: 'Pronto' },
      });
    },

    async generateFromImage(file, name) {
      set({ status: { kind: 'busy', text: 'Lendo imagem…' } });
      if (get().imageMode === 'foto') {
        try {
          const { photoTo3D } = await import('./lib/photo3d');
          const r = await photoTo3D(file, {
            length: get().imageLength,
            relief: get().relief,
            useAI: get().useAI,
            onStage: (text) => set({ status: { kind: 'busy', text } }),
            onProgress: ({ model, loaded, total }) =>
              set({ status: { kind: 'busy', text: `Baixando IA ${model}: ${(loaded / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB (só na 1ª vez)` } }),
          });
          rebuild({ source: 'image', imagePart: r.part, imageName: name });
          set({ photo: r.texture, understood: [`Foto: ${name}`, ...r.notes], ignored: [], status: { kind: 'ready', text: 'Pronto' } });
        } catch (e) {
          set({ status: { kind: 'error', text: e instanceof Error ? e.message : 'Falha ao processar a foto' } });
        }
        return;
      }
      try {
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
        const w = Math.max(8, Math.round(bmp.width * scale));
        const h = Math.max(8, Math.round(bmp.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0, w, h);
        bmp.close?.();
        set({ status: { kind: 'busy', text: 'Segmentando silhueta…' } });
        await frame();
        const img = ctx.getImageData(0, 0, w, h);
        set({ status: { kind: 'busy', text: 'Gerando malha Hard-Surface…' } });
        await frame();
        const r = silhouetteToMesh(img, { length: get().imageLength, depth: Math.max(0.02, get().imageLength * 0.045) });
        const imagePart: WeaponPart = { name: 'Corpo (silhueta)', slot: 'polymer', mesh: r.mesh, shading: 'auto' };
        rebuild({ source: 'image', imagePart, imageName: name });
        set({
          photo: null,
          understood: [`Imagem: ${name}`, `Separação: ${r.method === 'alpha' ? 'transparência' : 'cor de fundo'}`, `Contorno: ${r.outline.length} pontos`, `Aberturas: ${r.holes.length}`],
          ignored: [],
          status: { kind: 'ready', text: 'Pronto' },
        });
      } catch (e) {
        set({ status: { kind: 'error', text: e instanceof Error ? e.message : 'Falha ao processar a imagem' } });
      }
    },
  };
});

/** Is a part currently drawn? (hidden toggle + solo/isolate). */
export const partVisible = (s: Pick<ArsenalState, 'hidden' | 'solo'>, key: string) => !s.hidden[key] && (!s.solo || s.solo === key);

import { create } from 'zustand';
import { registerSyncHooks } from '@/core/cloud/hooks';
import { commit, createHistory, redo, replace, undo, type HistoryState } from '@/core/history/history';
import { getDocument, saveModuleData, updateProjectMeta } from '@/core/projects/projectService';
import { useSettings } from '@/core/settings/settings';
import { debounce, type Debounced } from '@/core/utils/debounce';
import { toast } from '@/ui/toast';
import { createLayer, createTextureDoc, normalizeTextureDoc, type Layer, type TextureDoc } from './engine/types';
import type { TextureMaps } from './engine/compose';
import { DEFAULT_BRUSH, type BrushSettings } from './engine/paint3d';

export const MODULE_ID = 'texture-studio';
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type MapView = 'baseColor' | 'roughness' | 'metallic' | 'normal' | 'height' | 'ao' | 'emissive';

export type Brush = BrushSettings;

interface State {
  projectId: string | null;
  loading: boolean;
  loadError: string | null;
  history: HistoryState<TextureDoc>;
  /** Snapshot at the start of a slider drag (one undo step per gesture). */
  gestureBase: TextureDoc | null;
  selected: string | null;
  view: '2d' | '3d';
  mapView: MapView;
  tile2d: boolean;
  brush: Brush;
  saveStatus: SaveStatus;
  /** Latest preview maps (low resolution). */
  preview: TextureMaps | null;
  evaluating: boolean;
  /** Bumped while painting so the preview re-evaluates from the live canvas. */
  paintTick: number;
  previewSize: 256 | 512 | 1024;
  /** Paint mode (brush active on the 2D/3D views when the selected layer has a paint mask). */
  painting: boolean;

  load(projectId: string): Promise<void>;
  unload(): Promise<void>;
  saveNow(): Promise<void>;
  /** Committed change (undo step). */
  apply(fn: (d: TextureDoc) => TextureDoc): void;
  /** Live change during a gesture (no undo step until endGesture). */
  live(fn: (d: TextureDoc) => TextureDoc): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  set(p: Partial<State>): void;
  updateLayer(id: string, fn: (l: Layer) => Layer, liveOnly?: boolean): void;
  addLayer(l: Layer, select?: boolean): void;
}

let saver: Debounced<[]> | null = null;

export const useTextures = create<State>((set, get) => {
  const persist = async () => {
    const { projectId, history, preview } = get();
    if (!projectId) return;
    set({ saveStatus: 'saving' });
    try {
      await saveModuleData(projectId, MODULE_ID, history.present);
      set({ saveStatus: 'saved' });
      if (preview) {
        const thumb = mapToDataUrl(preview.baseColor, preview.size, 96);
        if (thumb) updateProjectMeta(projectId, { thumbnail: thumb }).catch(() => undefined);
      }
    } catch {
      set({ saveStatus: 'error' });
    }
  };
  const dirty = () => {
    set({ saveStatus: 'dirty' });
    saver?.();
  };
  const keepSelection = (doc: TextureDoc) => {
    const sel = get().selected;
    return sel && doc.layers.some((l) => l.id === sel) ? sel : doc.layers[doc.layers.length - 1]?.id ?? null;
  };

  return {
    projectId: null,
    loading: false,
    loadError: null,
    history: createHistory(createTextureDoc()),
    gestureBase: null,
    selected: null,
    view: '3d',
    mapView: 'baseColor',
    tile2d: false,
    brush: { ...DEFAULT_BRUSH },
    saveStatus: 'idle',
    preview: null,
    evaluating: false,
    paintTick: 0,
    previewSize: 256,
    painting: true,

    async load(projectId) {
      await get().unload();
      set({ loading: true, loadError: null, projectId });
      try {
        const doc = await getDocument(projectId);
        if (!doc) throw new Error('Projeto não encontrado');
        const raw = doc.modules[MODULE_ID];
        const tex = raw ? normalizeTextureDoc(raw) : createTextureDoc();
        saver = debounce(() => void persist(), useSettings.getState().settings.autosaveDelayMs);
        set({ history: createHistory(tex), loading: false, selected: tex.layers[tex.layers.length - 1]?.id ?? null, saveStatus: raw ? 'saved' : 'idle', preview: null });
        if (!raw) await persist();
      } catch (e) {
        set({ loading: false, loadError: e instanceof Error ? e.message : String(e) });
      }
    },
    async unload() {
      saver?.flush();
      saver = null;
      set({ projectId: null, gestureBase: null });
    },
    async saveNow() {
      saver?.cancel();
      await persist();
    },
    apply(fn) {
      const h = get().history;
      const next = fn(h.present);
      if (next === h.present) return;
      set({ history: commit(h, next), selected: keepSelection(next) });
      dirty();
    },
    live(fn) {
      const { history, gestureBase } = get();
      set({ gestureBase: gestureBase ?? history.present, history: replace(history, fn(history.present)) });
    },
    endGesture() {
      const { history, gestureBase } = get();
      if (!gestureBase) return;
      set({ gestureBase: null });
      if (history.present !== gestureBase) {
        set({ history: commit(history, history.present, gestureBase) });
        dirty();
      }
    },
    undo() {
      const h = get().history;
      if (!h.past.length) return;
      const next = undo(h);
      set({ history: next, selected: keepSelection(next.present) });
      dirty();
    },
    redo() {
      const h = get().history;
      if (!h.future.length) return;
      const next = redo(h);
      set({ history: next, selected: keepSelection(next.present) });
      dirty();
    },
    set: (p) => set(p),
    updateLayer(id, fn, liveOnly = false) {
      const f = (d: TextureDoc) => ({ ...d, layers: d.layers.map((l) => (l.id === id ? fn(l) : l)) });
      if (liveOnly) get().live(f);
      else get().apply(f);
    },
    addLayer(l, select = true) {
      get().apply((d) => {
        const sel = get().selected;
        const idx = sel ? d.layers.findIndex((x) => x.id === sel) : d.layers.length - 1;
        const layers = [...d.layers];
        layers.splice(idx + 1, 0, l);
        return { ...d, layers };
      });
      if (select) set({ selected: l.id });
    },
  };
});

export const selectDoc = (s: State) => s.history.present;

/** Small PNG data URL from RGBA (browser only; thumbnails). */
export function mapToDataUrl(rgba: Uint8ClampedArray, size: number, out = size): string | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  if (out === size) return c.toDataURL('image/png');
  const d = document.createElement('canvas');
  d.width = out;
  d.height = out;
  d.getContext('2d')!.drawImage(c, 0, 0, out, out);
  return d.toDataURL('image/png');
}

/** Quick-add layer templates. */
export const LAYER_TEMPLATES: { id: string; label: string; make: () => Layer }[] = [
  { id: 'fill', label: 'Preenchimento', make: () => createLayer('Preenchimento', { content: { colors: ['#9a9a9a'] } }) },
  { id: 'pattern', label: 'Padrão procedural', make: () => createLayer('Padrão', { content: { colors: ['#303030', '#b0b0b0'], pattern: { gen: 'noise', params: { scale: 4, octaves: 5, persistence: 0.5, stretch: 1, seed: 1 }, low: 0, high: 1, invert: false }, heightAmount: 0.03, roughA: 0.6, roughB: 0.4 } }) },
  { id: 'paint', label: 'Pintura (pincel)', make: () => createLayer('Pintura', { channels: { height: false }, content: { colors: ['#c0392b'], roughA: 0.5, roughB: 0.5 }, mask: { kind: 'paint' } }) },
  { id: 'text', label: 'Texto / decalque', make: () => createLayer('Gravação', { channels: { metal: false }, content: { colors: ['#e8e8e8'], roughA: 0.35, roughB: 0.35, heightOffset: -0.04 }, mask: { kind: 'text', text: { text: 'CAL. 5.56 NATO', font: 'Arial', size: 0.06, x: 0.5, y: 0.5, rotation: 0, bold: true, repeat: 1 } } }) },
  { id: 'edges', label: 'Desgaste de bordas', make: () => createLayer('Bordas gastas', { channels: { height: false }, content: { colors: ['#c4c8ce'], roughA: 0.25, roughB: 0.25, metalA: 1, metalB: 1 }, mask: { kind: 'curvature', side: 'convex', amount: 0.6 } }) },
  { id: 'dirt', label: 'Sujeira nas cavidades', make: () => createLayer('Sujeira', { blend: 'multiply', channels: { height: false, metal: false }, content: { colors: ['#5b5246'], roughA: 0.9, roughB: 0.9 }, mask: { kind: 'curvature', side: 'concave', amount: 0.5 } }) },
  { id: 'scratches', label: 'Arranhões', make: () => createLayer('Arranhões', { channels: { height: false }, content: { colors: ['#d0d3d8'], roughA: 0.2, roughB: 0.2, metalA: 1, metalB: 1 }, mask: { kind: 'pattern', pattern: { gen: 'scratches', params: { count: 120, length: 0.12, width: 0.0015, angle: 30, variance: 120, seed: 3 }, low: 0, high: 1, invert: false } } }) },
  { id: 'grunge', label: 'Grunge', make: () => createLayer('Grunge', { blend: 'multiply', channels: { height: false, metal: false }, opacity: 0.6, content: { colors: ['#6d6455'], roughA: 0.85, roughB: 0.85 }, mask: { kind: 'pattern', pattern: { gen: 'grunge', params: { scale: 3, coverage: 0.45, sharpness: 4, seed: 2 }, low: 0, high: 1, invert: false } } }) },
];

registerSyncHooks({
  beforeSync: async () => {
    if (useTextures.getState().projectId) await useTextures.getState().saveNow();
  },
  onPulled: (kind, id, deleted) => {
    const st = useTextures.getState();
    if (kind !== 'project' || st.projectId !== id || deleted) return;
    saver?.cancel();
    void st.load(id).then(() => toast.info('Textura atualizada com alterações de outro dispositivo.'));
  },
});

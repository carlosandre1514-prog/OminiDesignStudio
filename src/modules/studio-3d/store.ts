import { create } from 'zustand';
import { registerSyncHooks } from '@/core/cloud/hooks';
import { commit, createHistory, redo, replace, undo, type HistoryState } from '@/core/history/history';
import { createVersion, getDocument, saveModuleData, updateProjectMeta } from '@/core/projects/projectService';
import { useSettings } from '@/core/settings/settings';
import { debounce, type Debounced } from '@/core/utils/debounce';
import { toast } from '@/ui/toast';
import * as P from './mesh/polyMesh';
import { createEmptyScene, normalizeScene, type Obj3D, type Scene3DDoc } from './model';
import * as ops from './ops';

export const MODULE_ID = '3d-studio';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
export type EditSelectMode = 'vertex' | 'edge' | 'face';
export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type ViewShading = 'wireframe' | 'solid' | 'material';

export interface EditSelection {
  mode: EditSelectMode;
  vertices: number[];
  /** Edges as [a, b] with a < b. */
  edges: [number, number][];
  faces: number[];
}

const emptyEdit = (mode: EditSelectMode = 'face'): EditSelection => ({ mode, vertices: [], edges: [], faces: [] });

interface Studio3DState {
  projectId: string | null;
  loading: boolean;
  loadError: string | null;
  history: HistoryState<Scene3DDoc>;
  gestureBase: Scene3DDoc | null;
  selection: string[];
  mode: 'object' | 'edit';
  editSel: EditSelection;
  gizmo: GizmoMode;
  space: 'world' | 'local';
  snap: boolean;
  shading: ViewShading;
  saveStatus: SaveStatus;
  /** Function registered by the viewport to capture a PNG of the current view. */
  capture: ((opts?: { transparent?: boolean; scale?: number }) => Promise<string | null>) | null;

  load(projectId: string): Promise<void>;
  unload(): Promise<void>;
  apply(fn: (d: Scene3DDoc) => Scene3DDoc): void;
  live(fn: (d: Scene3DDoc) => Scene3DDoc): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  setMode(mode: 'object' | 'edit'): void;
  setEditSel(sel: Partial<EditSelection>): void;
  set(p: Partial<Pick<Studio3DState, 'gizmo' | 'space' | 'snap' | 'shading' | 'capture' | 'presenting'>>): void;
  saveNow(): Promise<void>;
  /** Camera moves are saved but are not undo steps. `programmatic` = view presets that the viewport must apply. */
  setCamera(cam: Partial<Scene3DDoc['camera']>, programmatic?: boolean): void;
  cameraRevision: number;
  presenting: boolean;
  /** Apply a function to the mesh of the object being edited. */
  editMesh(fn: (m: P.PolyMesh) => { mesh: P.PolyMesh; select?: Partial<EditSelection> } | P.PolyMesh): void;
}

let saver: Debounced<[]> | null = null;
let versionTimer: ReturnType<typeof setInterval> | null = null;
let changed = false;
let thumbTimer: ReturnType<typeof setTimeout> | null = null;

export const useStudio3D = create<Studio3DState>((set, get) => {
  const persist = async () => {
    const { projectId, history } = get();
    if (!projectId) return;
    set({ saveStatus: 'saving' });
    try {
      await saveModuleData(projectId, MODULE_ID, history.present);
      set({ saveStatus: 'saved' });
      if (thumbTimer) clearTimeout(thumbTimer);
      thumbTimer = setTimeout(async () => {
        const { capture, projectId: pid } = get();
        const thumbnail = capture ? await capture({ scale: 0.35 }) : null;
        if (pid && thumbnail) updateProjectMeta(pid, { thumbnail }).catch(() => undefined);
      }, 1500);
    } catch {
      set({ saveStatus: 'error' });
    }
  };

  const dirty = () => {
    changed = true;
    set({ saveStatus: 'dirty' });
    saver?.();
  };

  const setHistory = (history: HistoryState<Scene3DDoc>) => {
    const ids = new Set(history.present.objects.map((o) => o.id));
    const { selection, mode } = get();
    const sel = selection.filter((id) => ids.has(id));
    const target = sel.length === 1 ? history.present.objects.find((o) => o.id === sel[0]) : undefined;
    set({ history, selection: sel, ...(mode === 'edit' && target?.geometry?.kind !== 'mesh' ? { mode: 'object' as const } : {}) });
  };

  return {
    projectId: null,
    loading: false,
    loadError: null,
    history: createHistory(createEmptyScene()),
    gestureBase: null,
    selection: [],
    mode: 'object',
    editSel: emptyEdit(),
    gizmo: 'translate',
    space: 'world',
    snap: false,
    shading: 'material',
    saveStatus: 'idle',
    capture: null,
    cameraRevision: 0,
    presenting: false,

    setCamera(cam, programmatic = false) {
      const h = get().history;
      const present = { ...h.present, camera: { ...h.present.camera, ...cam } };
      set({ history: replace(h, present), ...(programmatic ? { cameraRevision: get().cameraRevision + 1 } : {}) });
      dirty();
    },

    async load(projectId) {
      await get().unload();
      set({ loading: true, loadError: null, projectId, mode: 'object', selection: [], editSel: emptyEdit() });
      try {
        const doc = await getDocument(projectId);
        if (!doc) throw new Error('Projeto não encontrado');
        const raw = doc.modules[MODULE_ID];
        const scene = raw ? normalizeScene(raw) : createEmptyScene();
        const { settings } = useSettings.getState();
        saver = debounce(() => void persist(), settings.autosaveDelayMs);
        if (settings.autoVersionMinutes > 0)
          versionTimer = setInterval(() => {
            const id = get().projectId;
            if (id && changed) {
              changed = false;
              saver?.flush();
              createVersion(id, 'Automático', true).catch(() => undefined);
            }
          }, settings.autoVersionMinutes * 60_000);
        set({ history: createHistory(scene), loading: false, saveStatus: raw ? 'saved' : 'idle' });
        if (!raw) await persist();
      } catch (e) {
        set({ loading: false, loadError: e instanceof Error ? e.message : String(e) });
      }
    },

    async unload() {
      saver?.flush();
      saver = null;
      if (versionTimer) clearInterval(versionTimer);
      versionTimer = null;
      changed = false;
      set({ projectId: null, selection: [], gestureBase: null, capture: null });
    },

    apply(fn) {
      const h = get().history;
      const next = fn(h.present);
      if (next === h.present) return;
      setHistory(commit(h, next));
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
        setHistory(commit(history, history.present, gestureBase));
        dirty();
      }
    },

    undo() {
      const h = get().history;
      if (!h.past.length) return;
      setHistory(undo(h));
      set({ editSel: emptyEdit(get().editSel.mode) });
      dirty();
    },

    redo() {
      const h = get().history;
      if (!h.future.length) return;
      setHistory(redo(h));
      set({ editSel: emptyEdit(get().editSel.mode) });
      dirty();
    },

    select(ids) {
      set({ selection: [...new Set(ids)] });
    },

    setMode(mode) {
      const { selection, history } = get();
      if (mode === 'edit') {
        const o = selection.length === 1 ? ops.getObj(history.present, selection[0]) : undefined;
        if (!o || o.type !== 'mesh' || !o.geometry) {
          toast.info('Selecione um único objeto de malha para editar vértices, arestas e faces.');
          return;
        }
        if (o.locked) {
          toast.info('Objeto bloqueado.');
          return;
        }
        // Entering edit mode turns a primitive into an editable mesh (modifiers stay non-destructive).
        if (o.geometry.kind === 'primitive') get().apply((d) => ops.convertToMesh(d, o.id));
      }
      set({ mode, editSel: emptyEdit(get().editSel.mode) });
    },

    setEditSel(sel) {
      set({ editSel: { ...get().editSel, ...sel } });
    },

    set(p) {
      set(p);
    },

    async saveNow() {
      saver?.cancel();
      await persist();
    },

    editMesh(fn) {
      const { selection, history } = get();
      const o: Obj3D | undefined = selection.length === 1 ? ops.getObj(history.present, selection[0]) : undefined;
      if (!o || o.geometry?.kind !== 'mesh') return;
      const r = fn(o.geometry.mesh);
      const res = 'mesh' in r ? r : { mesh: r };
      get().apply((d) => ops.updateObjects(d, [o.id], () => ({ geometry: { kind: 'mesh', mesh: res.mesh } })));
      set({ editSel: { ...emptyEdit(get().editSel.mode), ...(res.select ?? {}) } });
    },
  };
});

export const selectScene = (s: Studio3DState) => s.history.present;
export const selectEditObject = (s: Studio3DState): Obj3D | undefined =>
  s.mode === 'edit' && s.selection.length === 1 ? ops.getObj(s.history.present, s.selection[0]) : undefined;

/** Vertex ids affected by the current edit selection. */
export function selectedVertexIds(sel: EditSelection, mesh: P.PolyMesh): number[] {
  if (sel.mode === 'vertex') return sel.vertices;
  if (sel.mode === 'edge') return [...new Set(sel.edges.flat())];
  return P.faceVertices(mesh, sel.faces);
}

registerSyncHooks({
  beforeSync: async () => {
    if (useStudio3D.getState().projectId) await useStudio3D.getState().saveNow();
  },
  onPulled: (kind, id, deleted) => {
    const st = useStudio3D.getState();
    if (kind !== 'project' || st.projectId !== id || deleted) return;
    saver?.cancel();
    void st.load(id).then(() => toast.info('Cena 3D atualizada com alterações de outro dispositivo.'));
  },
});

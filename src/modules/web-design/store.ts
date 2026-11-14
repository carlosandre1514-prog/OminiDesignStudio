import { create } from 'zustand';
import { commit, createHistory, redo, replace, undo, type HistoryState } from '@/core/history/history';
import { createVersion, getDocument, saveModuleData, updateProjectMeta } from '@/core/projects/projectService';
import { useSettings } from '@/core/settings/settings';
import { debounce, type Debounced } from '@/core/utils/debounce';
import { createEmptyDoc, normalizeDoc, type WDElement, type WDScreen, type WebDesignDoc } from './model';
import * as ops from './ops';
import { renderScreenThumbnail } from './thumbnail';

export const MODULE_ID = 'web-design';

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface WebDesignState {
  projectId: string | null;
  loading: boolean;
  loadError: string | null;
  history: HistoryState<WebDesignDoc>;
  gestureBase: WebDesignDoc | null;
  activeScreenId: string;
  selection: string[];
  saveStatus: SaveStatus;
  saveError: string | null;
  lastSavedAt: number | null;

  load(projectId: string): Promise<void>;
  unload(): Promise<void>;
  /** Apply a recorded (undoable) change to the document. */
  apply(fn: (doc: WebDesignDoc) => WebDesignDoc): void;
  applyScreen(fn: (screen: WDScreen) => WDScreen): void;
  /** Live change during a gesture (drag/resize); call endGesture to record a single undo step. */
  live(fn: (screen: WDScreen) => WDScreen): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  setActiveScreen(id: string): void;
  select(ids: string[]): void;
  saveNow(): Promise<void>;
  /** Replace the whole doc (e.g. after restoring a version) without keeping undo history. */
  reset(doc: WebDesignDoc): void;
}

let saver: Debounced<[]> | null = null;
let autoVersionTimer: ReturnType<typeof setInterval> | null = null;
let changedSinceVersion = false;
let thumbTimer: ReturnType<typeof setTimeout> | null = null;

export const useWebDesign = create<WebDesignState>((set, get) => {
  const persist = async () => {
    const { projectId, history } = get();
    if (!projectId) return;
    set({ saveStatus: 'saving' });
    try {
      await saveModuleData(projectId, MODULE_ID, history.present);
      set({ saveStatus: 'saved', saveError: null, lastSavedAt: Date.now() });
      scheduleThumbnail();
    } catch (e) {
      set({ saveStatus: 'error', saveError: e instanceof Error ? e.message : String(e) });
    }
  };

  const scheduleThumbnail = () => {
    if (thumbTimer) clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => {
      const { projectId, history } = get();
      const first = history.present.screens[0];
      if (!projectId || !first) return;
      const thumbnail = renderScreenThumbnail(first);
      if (thumbnail) updateProjectMeta(projectId, { thumbnail }).catch(() => undefined);
    }, 1500);
  };

  const markDirty = () => {
    changedSinceVersion = true;
    set({ saveStatus: 'dirty' });
    saver?.();
  };

  const setHistory = (history: HistoryState<WebDesignDoc>) => {
    const { activeScreenId, selection } = get();
    const screen = history.present.screens.find((s) => s.id === activeScreenId) ?? history.present.screens[0];
    const ids = new Set(screen.elements.map((e) => e.id));
    set({ history, activeScreenId: screen.id, selection: selection.filter((id) => ids.has(id)) });
  };

  return {
    projectId: null,
    loading: false,
    loadError: null,
    history: createHistory(createEmptyDoc()),
    gestureBase: null,
    activeScreenId: '',
    selection: [],
    saveStatus: 'idle',
    saveError: null,
    lastSavedAt: null,

    async load(projectId) {
      await get().unload();
      set({ loading: true, loadError: null, projectId });
      try {
        const doc = await getDocument(projectId);
        if (!doc) throw new Error('Projeto não encontrado');
        const { settings } = useSettings.getState();
        const raw = doc.modules[MODULE_ID];
        const wd = raw
          ? normalizeDoc(raw)
          : createEmptyDoc(1280, 800, { size: settings.defaultGridSize, show: settings.showGridByDefault, snap: settings.snapToGridByDefault });
        saver = debounce(() => void persist(), settings.autosaveDelayMs);
        if (settings.autoVersionMinutes > 0) {
          autoVersionTimer = setInterval(() => {
            const id = get().projectId;
            if (id && changedSinceVersion) {
              changedSinceVersion = false;
              saver?.flush();
              createVersion(id, 'Automático', true).catch(() => undefined);
            }
          }, settings.autoVersionMinutes * 60_000);
        }
        set({
          history: createHistory(wd),
          activeScreenId: wd.screens[0].id,
          selection: [],
          loading: false,
          saveStatus: raw ? 'saved' : 'idle',
          lastSavedAt: doc.updatedAt,
        });
        if (!raw) await persist();
      } catch (e) {
        set({ loading: false, loadError: e instanceof Error ? e.message : String(e) });
      }
    },

    async unload() {
      saver?.flush();
      saver = null;
      if (autoVersionTimer) clearInterval(autoVersionTimer);
      autoVersionTimer = null;
      changedSinceVersion = false;
      set({ projectId: null, selection: [], gestureBase: null });
    },

    apply(fn) {
      const h = get().history;
      const next = fn(h.present);
      if (next === h.present) return;
      setHistory(commit(h, next));
      markDirty();
    },

    applyScreen(fn) {
      const id = get().activeScreenId;
      get().apply((doc) => ops.updateScreen(doc, id, fn));
    },

    live(fn) {
      const { history, gestureBase, activeScreenId } = get();
      const base = gestureBase ?? history.present;
      set({ gestureBase: base, history: replace(history, ops.updateScreen(history.present, activeScreenId, fn)) });
    },

    endGesture() {
      const { history, gestureBase } = get();
      if (!gestureBase) return;
      set({ gestureBase: null });
      if (history.present !== gestureBase) {
        setHistory(commit(history, history.present, gestureBase));
        markDirty();
      }
    },

    undo() {
      const h = get().history;
      if (!h.past.length) return;
      setHistory(undo(h));
      markDirty();
    },

    redo() {
      const h = get().history;
      if (!h.future.length) return;
      setHistory(redo(h));
      markDirty();
    },

    setActiveScreen(id) {
      if (get().history.present.screens.some((s) => s.id === id)) set({ activeScreenId: id, selection: [] });
    },

    select(ids) {
      set({ selection: [...new Set(ids)] });
    },

    async saveNow() {
      saver?.cancel();
      await persist();
    },

    reset(doc) {
      const wd = normalizeDoc(doc);
      set({ history: createHistory(wd), activeScreenId: wd.screens[0].id, selection: [] });
    },
  };
});

// ---------- selectors ----------

export const selectDoc = (s: WebDesignState) => s.history.present;
export const selectScreen = (s: WebDesignState): WDScreen =>
  s.history.present.screens.find((x) => x.id === s.activeScreenId) ?? s.history.present.screens[0];
export const selectSelected = (s: WebDesignState): WDElement[] => {
  const screen = selectScreen(s);
  return s.selection.map((id) => screen.elements.find((e) => e.id === id)).filter((e): e is WDElement => !!e);
};

// ---------- clipboard (shared across screens; also mirrored to system clipboard as JSON) ----------

let clipboard: WDElement[] = [];

export function copySelection(cut = false): number {
  const st = useWebDesign.getState();
  const screen = selectScreen(st);
  if (!st.selection.length) return 0;
  clipboard = ops.cloneElements(screen, st.selection);
  try {
    void navigator.clipboard?.writeText(JSON.stringify({ omnidesign: 'elements', elements: clipboard }));
  } catch {
    /* system clipboard is optional */
  }
  if (cut) {
    st.applyScreen((s) => ops.deleteElements(s, st.selection));
    st.select([]);
  }
  return clipboard.length;
}

export function pasteClipboard(offset = 16): void {
  if (!clipboard.length) return;
  const st = useWebDesign.getState();
  const items = clipboard.map((e) => ({ ...e }));
  // Fresh ids on every paste.
  const tmpScreen: WDScreen = { id: 'tmp', name: '', width: 0, height: 0, background: '', guides: { x: [], y: [] }, elements: items };
  const roots = items.filter((e) => !e.parentId || !items.some((o) => o.id === e.parentId)).map((e) => e.id);
  const clones = ops.cloneElements(tmpScreen, roots).map((e) => ({ ...e, x: e.x + offset, y: e.y + offset }));
  const newRoots = clones.filter((c) => !c.parentId || !clones.some((o) => o.id === c.parentId)).map((c) => ({ ...c }));
  const finalEls = clones.map((c) => (newRoots.some((r) => r.id === c.id) ? { ...c, parentId: null } : c));
  st.applyScreen((s) => ops.addElements(s, finalEls));
  st.select(newRoots.map((r) => r.id));
  clipboard = clipboard.map((e) => ({ ...e, x: e.x + offset, y: e.y + offset }));
}

export function hasClipboard(): boolean {
  return clipboard.length > 0;
}

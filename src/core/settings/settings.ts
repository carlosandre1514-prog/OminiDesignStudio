import { create } from 'zustand';
import { db } from '@/core/db/database';

export interface AppSettings {
  autosaveDelayMs: number;
  /** Create an automatic restore point every N minutes of editing (0 = off). */
  autoVersionMinutes: number;
  maxImportSizeMB: number;
  defaultGridSize: number;
  showGridByDefault: boolean;
  snapToGridByDefault: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  autosaveDelayMs: 800,
  autoVersionMinutes: 10,
  maxImportSizeMB: 50,
  defaultGridSize: 8,
  showGridByDefault: true,
  snapToGridByDefault: true,
  reduceMotion: false,
};

const KEY = 'app-settings';

export function normalizeSettings(raw: unknown): AppSettings {
  const s = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  const num = (k: keyof AppSettings, min: number, max: number) => {
    const v = Number(r[k]);
    if (Number.isFinite(v)) (s as Record<string, unknown>)[k] = Math.min(max, Math.max(min, v));
  };
  const bool = (k: keyof AppSettings) => {
    if (typeof r[k] === 'boolean') (s as Record<string, unknown>)[k] = r[k];
  };
  num('autosaveDelayMs', 200, 10000);
  num('autoVersionMinutes', 0, 240);
  num('maxImportSizeMB', 1, 2048);
  num('defaultGridSize', 2, 128);
  bool('showGridByDefault');
  bool('snapToGridByDefault');
  bool('reduceMotion');
  return s;
}

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  load(): Promise<void>;
  update(patch: Partial<AppSettings>): Promise<void>;
  reset(): Promise<void>;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    try {
      const rec = await db.settings.get(KEY);
      set({ settings: normalizeSettings(rec?.value), loaded: true });
    } catch {
      set({ settings: DEFAULT_SETTINGS, loaded: true });
    }
  },
  async update(patch) {
    const settings = normalizeSettings({ ...get().settings, ...patch });
    set({ settings });
    await db.settings.put({ key: KEY, value: settings });
  },
  async reset() {
    set({ settings: DEFAULT_SETTINGS });
    await db.settings.put({ key: KEY, value: DEFAULT_SETTINGS });
  },
}));

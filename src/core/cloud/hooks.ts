import type { SyncKind } from './types';

/**
 * Integration points between the sync engine and open editors, without coupling modules to the cloud backend:
 * - beforeSync: flush pending autosaves so the engine sees the latest local state;
 * - onPulled: a record changed locally because of the cloud (an open editor must reload it).
 */
export interface SyncHooks {
  beforeSync?: () => Promise<void> | void;
  onPulled?: (kind: SyncKind, id: string, deleted: boolean) => void;
}

const hooks = new Set<SyncHooks>();

export function registerSyncHooks(h: SyncHooks): () => void {
  hooks.add(h);
  return () => hooks.delete(h);
}

export async function runBeforeSync(): Promise<void> {
  for (const h of hooks) await h.beforeSync?.();
}

export function notifyPulled(kind: SyncKind, id: string, deleted: boolean): void {
  for (const h of hooks) {
    try {
      h.onPulled?.(kind, id, deleted);
    } catch (e) {
      console.error('[OmniDesign] onPulled hook failed', e);
    }
  }
}

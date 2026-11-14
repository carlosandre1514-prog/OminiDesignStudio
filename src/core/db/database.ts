import Dexie, { type EntityTable } from 'dexie';
import type { Asset, AssetData, AssetFolder } from '@/core/assets/types';
import type { SyncConflict, SyncStateRecord } from '@/core/cloud/types';
import type { HistoryEntry, ProjectDocument, ProjectMeta, ProjectVersion } from '@/core/projects/types';

export interface SettingRecord {
  key: string;
  value: unknown;
}

/**
 * Single IndexedDB database shared by every module.
 * Modules never open their own databases; they persist through services
 * built on top of these tables so that projects, history and storage stay unified.
 */
export class OmniDatabase extends Dexie {
  projects!: EntityTable<ProjectMeta, 'id'>;
  documents!: EntityTable<ProjectDocument, 'projectId'>;
  versions!: EntityTable<ProjectVersion, 'id'>;
  history!: EntityTable<HistoryEntry, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  assets!: EntityTable<Asset, 'id'>;
  assetData!: EntityTable<AssetData, 'hash'>;
  folders!: EntityTable<AssetFolder, 'id'>;
  syncState!: EntityTable<SyncStateRecord, 'key'>;
  syncConflicts!: EntityTable<SyncConflict, 'key'>;

  constructor(name = 'omnidesign-studio') {
    super(name);
    this.version(1).stores({
      projects: 'id, name, category, updatedAt, createdAt, lastOpenedAt',
      documents: 'projectId',
      versions: 'id, projectId, createdAt, [projectId+createdAt]',
      history: '++id, projectId, at',
      settings: 'key',
    });
    // v2 (Fase 3): Asset Library. Content-addressed bytes (assetData) are shared by duplicates.
    this.version(2).stores({
      assets: 'id, name, kind, category, folderId, hash, createdAt, updatedAt, *tags, *projectIds',
      assetData: 'hash',
      folders: 'id, parentId, name',
    });
    // v3 (Fase 6): cloud sync bookkeeping. Last synced revision/hash per record and account, plus open conflicts.
    this.version(3).stores({
      syncState: 'key, owner, [owner+kind]',
      syncConflicts: 'key, owner, kind, recordId',
    });
  }
}

export const db = new OmniDatabase();

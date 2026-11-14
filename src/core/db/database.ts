import Dexie, { type EntityTable } from 'dexie';
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

  constructor(name = 'omnidesign-studio') {
    super(name);
    this.version(1).stores({
      projects: 'id, name, category, updatedAt, createdAt, lastOpenedAt',
      documents: 'projectId',
      versions: 'id, projectId, createdAt, [projectId+createdAt]',
      history: '++id, projectId, at',
      settings: 'key',
    });
  }
}

export const db = new OmniDatabase();

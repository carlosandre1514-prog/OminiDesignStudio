export const PROJECT_SCHEMA_VERSION = 1;

export type ProjectCategory = 'web' | 'app' | 'game' | '3d' | 'mixed';

export const PROJECT_CATEGORIES: { id: ProjectCategory; label: string }[] = [
  { id: 'web', label: 'Web Design' },
  { id: 'app', label: 'App Design' },
  { id: 'game', label: 'Game Design' },
  { id: '3d', label: '3D' },
  { id: 'mixed', label: 'Multidisciplinar' },
];

export interface ProjectMeta {
  id: string;
  name: string;
  description: string;
  category: ProjectCategory;
  /** Data URL (PNG/JPEG) thumbnail generated from the project content. */
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt?: number;
  favorite: boolean;
  tags: string[];
  /** Where the canonical copy lives. Cloud sync is a later phase. */
  storage: 'local';
  schemaVersion: number;
}

/** Per-project content. Each module owns a key inside `modules`. */
export interface ProjectDocument {
  projectId: string;
  modules: Record<string, unknown>;
  updatedAt: number;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  label: string;
  createdAt: number;
  auto: boolean;
  /** JSON-serialised ProjectDocument.modules */
  snapshot: string;
  size: number;
}

export interface HistoryEntry {
  id?: number;
  projectId: string;
  at: number;
  action: string;
}

/** Portable .omni workspace file. */
export interface OmniFile {
  format: 'omnidesign-project';
  schemaVersion: number;
  exportedAt: number;
  meta: Omit<ProjectMeta, 'id'> & { id?: string };
  document: { modules: Record<string, unknown> };
  versions?: Omit<ProjectVersion, 'projectId'>[];
}

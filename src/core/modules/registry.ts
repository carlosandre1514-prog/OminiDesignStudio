import type { ComponentType, LazyExoticComponent } from 'react';
import type { ProjectCategory } from '@/core/projects/types';

export interface ModuleEditorProps {
  projectId: string;
}

export interface StudioModule {
  id: string;
  name: string;
  description: string;
  /** Single glyph/emoji or short label used in navigation. */
  icon: string;
  /** Development phase that delivers the module (see DEVELOPMENT_STATUS.md). */
  phase: number;
  status: 'available' | 'planned';
  /** Categories whose new projects open this module by default. */
  defaultFor: ProjectCategory[];
  /** Lazily loaded editor: heavy tools are only downloaded when opened. */
  editor?: LazyExoticComponent<ComponentType<ModuleEditorProps>>;
}

const modules = new Map<string, StudioModule>();

/** Register (or replace) a module. Plugins use the same entry point. */
export function registerModule(mod: StudioModule): void {
  if (mod.status === 'available' && !mod.editor) throw new Error(`Módulo "${mod.id}" disponível sem editor`);
  modules.set(mod.id, mod);
}

export function getModule(id: string): StudioModule | undefined {
  return modules.get(id);
}

export function listModules(): StudioModule[] {
  return [...modules.values()].sort((a, b) => a.phase - b.phase || a.name.localeCompare(b.name));
}

export function defaultModuleFor(category: ProjectCategory): StudioModule | undefined {
  const all = listModules();
  return all.find((m) => m.status === 'available' && m.defaultFor.includes(category)) ?? all.find((m) => m.status === 'available');
}

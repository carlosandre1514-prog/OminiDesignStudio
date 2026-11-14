import type { ModuleEditorProps } from '@/core/modules/registry';
import AssetLibrary from './AssetLibrary';

export default function AssetLibraryModule({ projectId }: ModuleEditorProps) {
  return <AssetLibrary projectId={projectId} />;
}

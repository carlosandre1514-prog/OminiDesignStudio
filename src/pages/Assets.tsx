import AssetLibrary from '@/modules/asset-library/AssetLibrary';

export default function Assets() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-ink-800 px-4 py-3 sm:px-6">
        <h1 className="text-xl font-semibold tracking-tight">Biblioteca de recursos</h1>
        <p className="text-xs text-ink-400">Assets compartilhados por todos os projetos e módulos.</p>
      </div>
      <div className="min-h-0 flex-1"><AssetLibrary /></div>
    </div>
  );
}

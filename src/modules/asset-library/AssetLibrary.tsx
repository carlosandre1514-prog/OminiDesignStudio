import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import {
  createFolder,
  deleteAssets,
  deleteFolder,
  exportAssetsZip,
  importAssetFiles,
  importAssetsZip,
  libraryStats,
  linkAssetToProject,
  listAllTags,
  listFolders,
  queryAssets,
  renameFolder,
  updateAsset,
  type AssetQuery,
} from '@/core/assets/assetService';
import { revokeAssetUrls } from '@/core/assets/assetUrls';
import { ACCEPT_ATTR } from '@/core/assets/formats';
import { ASSET_CATEGORIES, KIND_LABELS, type AssetFolder } from '@/core/assets/types';
import { db } from '@/core/db/database';
import { useSettings } from '@/core/settings/settings';
import { downloadBlob, formatBytes } from '@/core/utils/download';
import { toast } from '@/ui/toast';
import { AssetDetails } from './AssetDetails';
import { AssetThumb } from './AssetThumb';

const DRAG_MIME = 'application/x-omni-assets';

/** Import files and report results (shared by buttons, drop zone and the picker). */
export async function importWithFeedback(files: File[], opts: { folderId?: string | null; projectId?: string | null } = {}) {
  const max = useSettings.getState().settings.maxImportSizeMB * 1024 * 1024;
  const res = await importAssetFiles(files, { ...opts, maxSizeBytes: max });
  const created = res.filter((r) => r.status === 'created').length;
  const dup = res.filter((r) => r.status === 'duplicate');
  const errs = res.filter((r): r is Extract<typeof r, { status: 'error' }> => r.status === 'error');
  if (created) toast.success(`${created} asset(s) importado(s)`);
  if (dup.length) toast.info(`${dup.length} arquivo(s) já existiam na biblioteca e foram reaproveitados: ${dup.map((d) => d.fileName).join(', ')}`);
  for (const e of errs) toast.error(`${e.fileName}: ${e.error}`);
  return res;
}

function FolderNode({ folder, all, depth, active, onSelect }: { folder: AssetFolder; all: AssetFolder[]; depth: number; active: string | null | undefined; onSelect: (id: string) => void }) {
  const [over, setOver] = useState(false);
  const kids = all.filter((f) => f.parentId === folder.id);
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const ids: string[] = JSON.parse(e.dataTransfer.getData(DRAG_MIME) || '[]');
    for (const id of ids) await updateAsset(id, { folderId: folder.id });
    if (ids.length) toast.success(`${ids.length} asset(s) movido(s) para "${folder.name}"`);
  };
  return (
    <>
      <div
        className={`group flex items-center gap-1 rounded py-1 pr-1 text-sm ${active === folder.id ? 'bg-accent-500/15 text-accent-400' : 'text-ink-300 hover:bg-ink-800'} ${over ? 'ring-1 ring-accent-500' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <button className="min-w-0 flex-1 truncate text-left" onClick={() => onSelect(folder.id)}>📁 {folder.name}</button>
        <span className="hidden gap-1 group-hover:flex">
          <button className="text-xs text-ink-400 hover:text-ink-100" title="Nova subpasta" onClick={async () => { const n = prompt('Nome da subpasta'); if (n) await createFolder(n, folder.id); }}>+</button>
          <button className="text-xs text-ink-400 hover:text-ink-100" title="Renomear" onClick={async () => { const n = prompt('Novo nome', folder.name); if (n) await renameFolder(folder.id, n); }}>✎</button>
          <button className="text-xs text-ink-400 hover:text-red-300" title="Excluir pasta (o conteúdo vai para a pasta pai)" onClick={async () => { if (confirm(`Excluir a pasta "${folder.name}"? Os assets e subpastas serão movidos para a pasta acima.`)) await deleteFolder(folder.id); }}>✕</button>
        </span>
      </div>
      {kids.map((k) => <FolderNode key={k.id} folder={k} all={all} depth={depth + 1} active={active} onSelect={onSelect} />)}
    </>
  );
}

interface Props {
  /** When set, the library opens scoped to this project and new imports are linked to it. */
  projectId?: string;
}

export default function AssetLibrary({ projectId }: Props) {
  const [scopeProject, setScopeProject] = useState(!!projectId);
  const [query, setQuery] = useState<AssetQuery>({ sort: 'created' });
  const [selection, setSelection] = useState<string[]>([]);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showSide, setShowSide] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const effective: AssetQuery = { ...query, projectId: scopeProject ? projectId : undefined };
  const assets = useLiveQuery(() => queryAssets(effective), [JSON.stringify(effective)]);
  const folders = useLiveQuery(() => listFolders(), []) ?? [];
  const tags = useLiveQuery(() => listAllTags(), []) ?? [];
  const stats = useLiveQuery(() => libraryStats(), []);
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []);
  const details = useMemo(() => assets?.find((a) => a.id === detailsId) ?? null, [assets, detailsId]);
  const set = (p: Partial<AssetQuery>) => {
    setQuery((q) => ({ ...q, ...p }));
    setSelection([]);
  };

  const doImport = async (files: File[]) => {
    if (!files.length) return;
    const folderId = typeof query.folderId === 'string' ? query.folderId : null;
    await importWithFeedback(files, { folderId, projectId: projectId ?? null });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.types.includes(DRAG_MIME)) return;
    void doImport([...e.dataTransfer.files]);
  };

  const click = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else {
      setSelection([id]);
      setDetailsId(id);
    }
  };

  const sideItem = (label: string, active: boolean, onClick: () => void, extra?: React.ReactNode) => (
    <button className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${active ? 'bg-accent-500/15 text-accent-400' : 'text-ink-300 hover:bg-ink-800'}`} onClick={onClick}>
      <span className="truncate">{label}</span>
      {extra}
    </button>
  );

  const sidebar = (
    <div className="space-y-4 p-3">
      {projectId && (
        <div className="space-y-0.5">
          <div className="section-title mb-1">Escopo</div>
          {sideItem('Deste projeto', scopeProject, () => setScopeProject(true))}
          {sideItem('Toda a biblioteca', !scopeProject, () => setScopeProject(false))}
        </div>
      )}
      <div className="space-y-0.5">
        <div className="section-title mb-1">Visualizar</div>
        {sideItem('Todos os assets', query.folderId === undefined && !query.favorite && !query.category && !query.tag, () => set({ folderId: undefined, favorite: false, category: undefined, tag: undefined }))}
        {sideItem('★ Favoritos', !!query.favorite, () => set({ favorite: !query.favorite }))}
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="section-title">Pastas</span>
          <button className="icon-btn h-6 w-6" title="Nova pasta" aria-label="Nova pasta" onClick={async () => { const n = prompt('Nome da pasta'); if (n) await createFolder(n, typeof query.folderId === 'string' ? query.folderId : null); }}>+</button>
        </div>
        {sideItem('Sem pasta (raiz)', query.folderId === null, () => set({ folderId: null }))}
        {folders.filter((f) => !f.parentId).map((f) => <FolderNode key={f.id} folder={f} all={folders} depth={0} active={query.folderId} onSelect={(id) => set({ folderId: id })} />)}
        <p className="mt-1 px-2 text-[11px] text-ink-400">Arraste assets para uma pasta para movê-los.</p>
      </div>
      <div className="space-y-0.5">
        <div className="section-title mb-1">Categorias</div>
        {ASSET_CATEGORIES.map((c) => sideItem(c.label, query.category === c.id, () => set({ category: query.category === c.id ? undefined : c.id })))}
      </div>
      {tags.length > 0 && (
        <div>
          <div className="section-title mb-1">Tags</div>
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <button key={t} onClick={() => set({ tag: query.tag === t ? undefined : t })} className={`rounded-full border px-2 py-0.5 text-xs ${query.tag === t ? 'border-accent-500 bg-accent-500/15 text-accent-400' : 'border-ink-700 text-ink-300 hover:bg-ink-800'}`}>#{t}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0">
      <aside className={`${showSide ? 'absolute inset-y-0 left-0 z-20 block shadow-2xl' : 'hidden'} w-60 shrink-0 overflow-y-auto border-r border-ink-800 bg-ink-900 md:static md:block`}>{sidebar}</aside>
      <section
        className={`flex min-w-0 flex-1 flex-col ${dragOver ? 'outline-2 -outline-offset-4 outline-dashed outline-accent-500' : ''}`}
        onDragOver={(e) => { if (!e.dataTransfer.types.includes(DRAG_MIME)) { e.preventDefault(); setDragOver(true); } }}
        onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
        onDrop={onDrop}
        data-testid="asset-dropzone"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 p-3">
          <button className="icon-btn md:hidden" onClick={() => setShowSide(!showSide)} aria-label="Pastas e filtros">☰</button>
          <input className="input max-w-56" placeholder="Pesquisar nome ou tag" aria-label="Pesquisar assets" value={query.text ?? ''} onChange={(e) => set({ text: e.target.value })} />
          <select className="input w-auto" aria-label="Tipo" value={query.kind ?? ''} onChange={(e) => set({ kind: e.target.value || undefined })}>
            <option value="">Todos os tipos</option>
            {Object.entries(KIND_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="input w-auto" aria-label="Ordenar" value={query.sort} onChange={(e) => set({ sort: e.target.value as AssetQuery['sort'] })}>
            <option value="created">Mais recentes</option>
            <option value="updated">Modificados</option>
            <option value="name">Nome</option>
            <option value="size">Tamanho</option>
          </select>
          <div className="ml-auto flex items-center gap-2">
            {stats && <span className="hidden text-xs text-ink-400 lg:inline">{stats.count} assets · {formatBytes(stats.bytes)}</span>}
            <button className="btn-outline" onClick={() => zipRef.current?.click()} title="Pacote exportado pela biblioteca ou ZIP com arquivos suportados">Importar ZIP…</button>
            <input ref={zipRef} type="file" accept=".zip,application/zip" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                const res = await importAssetsZip(f, useSettings.getState().settings.maxImportSizeMB * 1024 * 1024);
                const ok = res.filter((r) => r.status === 'created').length;
                const dup = res.filter((r) => r.status === 'duplicate').length;
                toast.success(`ZIP importado: ${ok} novo(s), ${dup} já existente(s)`);
                for (const r of res) if (r.status === 'error') toast.error(`${r.fileName}: ${r.error}`);
                if (projectId) for (const r of res) if (r.status !== 'error') await linkAssetToProject(r.asset.id, projectId);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : String(err));
              }
            }} />
            <button className="btn-primary" onClick={() => inputRef.current?.click()}>Importar arquivos…</button>
            <input ref={inputRef} type="file" multiple accept={ACCEPT_ATTR} className="hidden" data-testid="asset-input" onChange={(e) => { void doImport([...(e.target.files ?? [])]); e.target.value = ''; }} />
          </div>
        </div>
        {selection.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 bg-ink-850 px-3 py-2 text-sm">
            <span>{selection.length} selecionados</span>
            <button className="btn-ghost" onClick={() => setSelection([])}>Limpar</button>
            <select className="input w-auto py-1 text-xs" aria-label="Mover para pasta" value="" onChange={async (e) => { const v = e.target.value; if (!v) return; for (const id of selection) await updateAsset(id, { folderId: v === '__root' ? null : v }); toast.success('Assets movidos'); }}>
              <option value="">Mover para…</option>
              <option value="__root">(raiz)</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            {projects && projects.length > 0 && (
              <select className="input w-auto py-1 text-xs" aria-label="Vincular a projeto" value="" onChange={async (e) => { if (!e.target.value) return; for (const id of selection) await linkAssetToProject(id, e.target.value); toast.success('Assets vinculados ao projeto'); }}>
                <option value="">Vincular a projeto…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <button className="btn-outline" onClick={async () => downloadBlob(await exportAssetsZip(selection), `assets-${selection.length}.zip`)}>Exportar ZIP</button>
            <button className="btn-danger" onClick={async () => { if (!confirm(`Excluir ${selection.length} assets da biblioteca?`)) return; await deleteAssets(selection); revokeAssetUrls(selection); setSelection([]); setDetailsId(null); toast.success('Assets excluídos'); }}>Excluir</button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {assets && assets.length === 0 && (
            <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-700 p-8 text-center">
              <p className="text-sm text-ink-300">Nenhum asset aqui.</p>
              <p className="text-xs text-ink-400">Arraste arquivos para esta área ou use "Importar arquivos". Formatos: PNG, JPG, WEBP, GIF, SVG, MP3, WAV, OGG, TTF, OTF, WOFF, WOFF2, GLB, GLTF, OBJ, MTL, FBX, STL.</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {assets?.map((a) => (
              <button
                key={a.id}
                draggable
                onDragStart={(e) => {
                  const ids = selection.includes(a.id) ? selection : [a.id];
                  e.dataTransfer.setData(DRAG_MIME, JSON.stringify(ids));
                }}
                onClick={(e) => click(a.id, e)}
                className={`group overflow-hidden rounded-lg border text-left transition-colors ${selection.includes(a.id) ? 'border-accent-500 ring-1 ring-accent-500' : 'border-ink-800 hover:border-ink-600'}`}
                data-testid="asset-card"
              >
                <div className="aspect-square overflow-hidden"><AssetThumb asset={a} /></div>
                <div className="flex items-center gap-1 bg-ink-900 px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                  {a.favorite && <span className="text-xs text-amber-400">★</span>}
                  <span className="text-[10px] uppercase text-ink-400">{a.ext}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      {details && (
        <aside className="absolute inset-y-0 right-0 z-20 w-full max-w-sm overflow-y-auto border-l border-ink-800 bg-ink-900 shadow-2xl xl:static xl:w-80 xl:shadow-none">
          <AssetDetails asset={details} onClose={() => { setDetailsId(null); setSelection([]); }} />
        </aside>
      )}
    </div>
  );
}

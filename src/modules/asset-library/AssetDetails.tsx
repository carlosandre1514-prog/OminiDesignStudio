import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import {
  deleteAssets,
  duplicateAsset,
  getAssetBlob,
  linkAssetToProject,
  listFolders,
  unlinkAssetFromProject,
  updateAsset,
  assetFileName,
} from '@/core/assets/assetService';
import { getAssetObjectUrl, revokeAssetUrls } from '@/core/assets/assetUrls';
import { ASSET_CATEGORIES, KIND_LABELS, type Asset, type AssetCategory } from '@/core/assets/types';
import { db } from '@/core/db/database';
import { downloadBlob, formatBytes } from '@/core/utils/download';
import { toast } from '@/ui/toast';
import { FontSample } from './AssetThumb';

function Preview({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void getAssetObjectUrl(asset.id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [asset.id]);
  if (asset.kind === 'image' || asset.kind === 'vector')
    return url ? (
      <img src={url} alt={asset.name} className="max-h-64 w-full rounded bg-[repeating-conic-gradient(#1c212c_0%_25%,#161a23_0%_50%)] bg-[length:16px_16px] object-contain" />
    ) : null;
  if (asset.kind === 'audio') return url ? <audio controls src={url} className="w-full" /> : null;
  if (asset.kind === 'font')
    return (
      <div className="space-y-1 rounded bg-ink-850 p-3 text-ink-100">
        <FontSample id={asset.id} text="Aa Bb Cc 123" className="block text-3xl" />
        <FontSample id={asset.id} text="O rápido zorro marrom pula sobre o cão." className="block text-sm" />
      </div>
    );
  if (asset.kind === 'component')
    return (
      <div className="space-y-2">
        {asset.thumbnail && <img src={asset.thumbnail} alt="" className="max-h-48 w-full rounded bg-white object-contain" />}
        <p className="text-xs text-ink-400">Componente de interface reutilizável. Insira-o no Web &amp; App Design pelo painel "Componentes" → "Da biblioteca".</p>
      </div>
    );
  return (
    <div className="rounded bg-ink-850 p-4 text-center text-xs text-ink-400">
      <div className="text-3xl">◈</div>
      Arquivo 3D armazenado. A visualização 3D chega com o 3D Design Studio (Fase 4).
    </div>
  );
}

export function AssetDetails({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const folders = useLiveQuery(() => listFolders(), []);
  const projects = useLiveQuery(() => db.projects.orderBy('name').toArray(), []);
  const [name, setName] = useState(asset.name);
  const [tags, setTags] = useState(asset.tags.join(', '));
  const tagKey = asset.tags.join(', ');
  // Depend on primitive values: live queries return new arrays on every refresh.
  useEffect(() => setName(asset.name), [asset.id, asset.name]);
  useEffect(() => setTags(tagKey), [asset.id, tagKey]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = async () => {
    const used = (projects ?? []).filter((p) => asset.projectIds.includes(p.id)).map((p) => p.name);
    const warn = used.length ? `\n\nVinculado a: ${used.join(', ')}. As referências nesses projetos ficarão como "asset ausente".` : '';
    if (!confirm(`Excluir "${asset.name}" da biblioteca?${warn}`)) return;
    await run(async () => {
      await deleteAssets([asset.id]);
      revokeAssetUrls([asset.id]);
      onClose();
    }, 'Asset excluído');
  };

  return (
    <div className="space-y-4 p-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="section-title">Detalhes</span>
        <button className="icon-btn h-7 w-7" onClick={onClose} aria-label="Fechar detalhes">✕</button>
      </div>
      <Preview asset={asset} />
      <div>
        <label className="label" htmlFor="ad-name">Nome</label>
        <input id="ad-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name !== asset.name && run(() => updateAsset(asset.id, { name }))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="ad-cat">Categoria</label>
          <select id="ad-cat" className="input" value={asset.category} onChange={(e) => run(() => updateAsset(asset.id, { category: e.target.value as AssetCategory }))}>
            {ASSET_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ad-folder">Pasta</label>
          <select id="ad-folder" className="input" value={asset.folderId ?? ''} onChange={(e) => run(() => updateAsset(asset.id, { folderId: e.target.value || null }))}>
            <option value="">(raiz)</option>
            {folders?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="ad-tags">Tags (separadas por vírgula)</label>
        <input id="ad-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} onBlur={() => run(() => updateAsset(asset.id, { tags: tags.split(',') }))} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={asset.favorite} onChange={(e) => run(() => updateAsset(asset.id, { favorite: e.target.checked }))} /> Favorito
      </label>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded bg-ink-850 p-3 text-xs">
        <dt className="text-ink-400">Tipo</dt><dd>{KIND_LABELS[asset.kind]} ({asset.ext.toUpperCase()})</dd>
        <dt className="text-ink-400">Tamanho</dt><dd>{formatBytes(asset.size)}</dd>
        {asset.meta.width && <><dt className="text-ink-400">Dimensões</dt><dd>{asset.meta.width}×{asset.meta.height}px</dd></>}
        {asset.meta.duration && <><dt className="text-ink-400">Duração</dt><dd>{asset.meta.duration.toFixed(1)}s</dd></>}
        <dt className="text-ink-400">Original</dt><dd className="truncate" title={asset.originalName}>{asset.originalName}</dd>
        <dt className="text-ink-400">Importado</dt><dd>{new Date(asset.createdAt).toLocaleString('pt-BR')}</dd>
        <dt className="text-ink-400">Hash</dt><dd className="truncate font-mono" title={asset.hash}>{asset.hash.slice(0, 16)}…</dd>
      </dl>
      <div>
        <span className="label">Vinculado aos projetos</span>
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {projects?.length === 0 && <li className="text-xs text-ink-400">Nenhum projeto.</li>}
          {projects?.map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={asset.projectIds.includes(p.id)}
                  onChange={(e) => run(() => (e.target.checked ? linkAssetToProject(asset.id, p.id) : unlinkAssetFromProject(asset.id, p.id)))}
                />
                {p.name}
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline" onClick={() => run(async () => { const b = await getAssetBlob(asset.id); if (b) downloadBlob(b, assetFileName(asset)); })}>Baixar</button>
        <button className="btn-outline" onClick={() => run(() => duplicateAsset(asset.id), 'Asset duplicado (o conteúdo é compartilhado, sem ocupar espaço extra)')}>Duplicar</button>
        <button className="btn-danger" onClick={remove}>Excluir</button>
      </div>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { linkAssetToProject, queryAssets } from '@/core/assets/assetService';
import { ACCEPT_ATTR } from '@/core/assets/formats';
import type { Asset, AssetKind } from '@/core/assets/types';
import { Modal } from '@/ui/Modal';
import { AssetThumb } from './AssetThumb';
import { importWithFeedback } from './AssetLibrary';

interface Props {
  kinds: AssetKind[];
  projectId?: string | null;
  title?: string;
  onPick: (asset: Asset) => void;
  onClose: () => void;
}

/** Choose (or import) a library asset. The chosen asset is linked to the project. */
export function AssetPicker({ kinds, projectId, title = 'Escolher da biblioteca', onPick, onClose }: Props) {
  const [text, setText] = useState('');
  const [onlyProject, setOnlyProject] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const assets = useLiveQuery(
    () => queryAssets({ text, projectId: onlyProject && projectId ? projectId : undefined, sort: 'created' }).then((r) => r.filter((a) => kinds.includes(a.kind))),
    [text, onlyProject, projectId, kinds.join()],
  );
  const pick = async (a: Asset) => {
    if (projectId) await linkAssetToProject(a.id, projectId);
    onPick(a);
    onClose();
  };
  return (
    <Modal open wide title={title} onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input max-w-60" placeholder="Pesquisar" value={text} onChange={(e) => setText(e.target.value)} aria-label="Pesquisar assets" autoFocus />
        {projectId && (
          <label className="flex items-center gap-1.5 text-sm text-ink-300">
            <input type="checkbox" checked={onlyProject} onChange={(e) => setOnlyProject(e.target.checked)} /> Somente deste projeto
          </label>
        )}
        <button className="btn-outline ml-auto" onClick={() => inputRef.current?.click()}>Importar…</button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept={ACCEPT_ATTR}
          data-testid="picker-input"
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            const res = await importWithFeedback(files, { projectId });
            const ok = res.find((r) => r.status !== 'error' && kinds.includes(r.asset.kind));
            if (ok && ok.status !== 'error' && files.length === 1) await pick(ok.asset);
          }}
        />
      </div>
      {assets?.length === 0 && <p className="py-8 text-center text-sm text-ink-400">Nenhum asset compatível. Importe um arquivo.</p>}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {assets?.map((a) => (
          <button key={a.id} className="overflow-hidden rounded-lg border border-ink-800 text-left hover:border-accent-500" onClick={() => void pick(a)} title={a.name}>
            <div className="aspect-square"><AssetThumb asset={a} /></div>
            <div className="truncate bg-ink-900 px-2 py-1 text-xs">{a.name}</div>
          </button>
        ))}
      </div>
    </Modal>
  );
}

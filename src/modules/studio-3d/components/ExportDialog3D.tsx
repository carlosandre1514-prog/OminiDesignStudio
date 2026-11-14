import { useState } from 'react';
import { downloadBlob } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { Modal } from '@/ui/Modal';
import { toast } from '@/ui/toast';
import { exportScene, type ExportFormat } from '../exporters';
import { selectScene, useStudio3D } from '../store';

type Fmt = ExportFormat | 'png';

const FORMATS: { id: Fmt; label: string; note: string }[] = [
  { id: 'glb', label: 'GLB', note: 'Arquivo único com geometria, hierarquia, materiais PBR, texturas e luzes. Recomendado.' },
  { id: 'gltf', label: 'GLTF', note: 'Mesmo conteúdo do GLB em JSON (texturas embutidas).' },
  { id: 'obj', label: 'OBJ', note: 'Geometria, normais e UVs. Sem materiais.' },
  { id: 'stl', label: 'STL', note: 'Apenas geometria — para impressão 3D.' },
  { id: 'png', label: 'PNG', note: 'Imagem da vista atual (com fundo transparente opcional).' },
];

export function ExportDialog3D({ projectName, onClose }: { projectName: string; onClose: () => void }) {
  const doc = useStudio3D(selectScene);
  const selection = useStudio3D((s) => s.selection);
  const [fmt, setFmt] = useState<Fmt>('glb');
  const [onlySel, setOnlySel] = useState(false);
  const [lights, setLights] = useState(true);
  const [transparent, setTransparent] = useState(false);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const base = slugify(projectName, 'cena');

  const run = async () => {
    setBusy(true);
    try {
      if (fmt === 'png') {
        const cap = useStudio3D.getState().capture;
        const url = cap ? await cap({ transparent, scale }) : null;
        if (!url) throw new Error('Viewport indisponível para captura.');
        const blob = await (await fetch(url)).blob();
        downloadBlob(blob, `${base}.png`);
      } else {
        const r = await exportScene(doc, fmt, base, { only: onlySel ? selection : undefined, includeLights: lights });
        downloadBlob(r.blob, r.fileName);
        r.warnings.forEach((w) => toast.info(w));
      }
      toast.success('Exportação concluída');
      onClose();
    } catch (e) {
      toast.error(`Falha na exportação: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title="Exportar cena 3D"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={busy} onClick={run}>{busy ? 'Exportando…' : `Exportar ${fmt.toUpperCase()}`}</button>
        </>
      }
    >
      <div className="space-y-2">
        {FORMATS.map((f) => (
          <label key={f.id} className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${fmt === f.id ? 'border-accent-500 bg-accent-500/10' : 'border-ink-700 hover:bg-ink-800'}`}>
            <input type="radio" name="fmt" checked={fmt === f.id} onChange={() => setFmt(f.id)} />
            <span>
              <span className="font-medium">{f.label}</span>
              <span className="block text-xs text-ink-400">{f.note}</span>
            </span>
          </label>
        ))}
        {fmt !== 'png' ? (
          <div className="space-y-1.5 pt-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={onlySel} disabled={!selection.length} onChange={(e) => setOnlySel(e.target.checked)} /> Somente a seleção ({selection.length})</label>
            {(fmt === 'glb' || fmt === 'gltf') && <label className="flex items-center gap-2"><input type="checkbox" checked={lights} onChange={(e) => setLights(e.target.checked)} /> Incluir luzes</label>}
          </div>
        ) : (
          <div className="space-y-1.5 pt-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> Fundo transparente</label>
            <label className="flex items-center gap-2">
              Resolução
              <select className="input w-auto py-1" value={scale} onChange={(e) => setScale(Number(e.target.value))} aria-label="Resolução">
                <option value={1}>1× (tamanho da tela)</option>
                <option value={2}>2×</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}

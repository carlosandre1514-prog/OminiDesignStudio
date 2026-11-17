import { Camera, Download, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { downloadBlob } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { toast } from '@/ui/toast';
import { SCENE_LABELS, type SceneLook } from '../canvas/ArsenalCanvas';
import { ASPECTS, canvasToBlob, renderSheet, renderSize, renderStill, RESOLUTIONS, type Aspect, type Resolution } from '../canvas/renderImage';
import { useArsenal, weaponById } from '../store';
import { Btn, Segmented, useProfile } from './ui';

/** Still render of the current weapon: Full HD, 4K or 8K, any aspect, studio looks, PNG/JPEG. */
export function RenderDialog({ onClose }: { onClose: () => void }) {
  const p = useProfile();
  const { scene, render, status } = useArsenal(useShallow((s) => ({ scene: s.scene, render: s.render, status: s.status })));
  const [format, setFormat] = useState<'jpg' | 'png'>('jpg');
  const [kind, setKind] = useState<'imagem' | 'folha'>('imagem');
  const [progress, setProgress] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const st = useArsenal.getState;
  const size = renderSize(render.res, render.aspect);
  const busy = progress !== null;

  const run = async () => {
    if (status.kind === 'busy') return toast.info('Aguarde a malha terminar de ser gerada.');
    setProgress(0);
    try {
      const s = st();
      const name = s.source === 'image' ? s.imageName : weaponById(s.weaponId).name;
      const base = slugify(name, 'arma');
      const c =
        kind === 'folha'
          ? await renderSheet({ width: Math.max(size.width, size.height), title: `${name.replace(/\s*\(HD\)/, '').toUpperCase()} — DESIGN REFERENCE SHEET · ALL ANGLES`, onProgress: setProgress })
          : await renderStill({ ...size, vignette: scene === 'dramatico' ? 0.55 : scene === 'estudio' ? 0.25 : 0, reframe: true, onProgress: setProgress });
      const blob = await canvasToBlob(c, format === 'png' ? 'image/png' : 'image/jpeg', 0.93);
      downloadBlob(blob, kind === 'folha' ? `${base}-folha-de-referencia-${RESOLUTIONS[render.res].label.replace(/\s/g, '')}.${format}` : `${base}-${RESOLUTIONS[render.res].label.replace(/\s/g, '')}-${render.aspect.replace(':', 'x')}.${format}`);
      // small preview (keeps memory low)
      const t = document.createElement('canvas');
      t.width = 640;
      t.height = Math.round((640 * c.height) / c.width);
      t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
      setPreview(t.toDataURL('image/jpeg', 0.85));
      toast.success(`Render ${c.width}×${c.height} salvo (${(blob.size / 1048576).toFixed(1)} MB)`);
    } catch (e) {
      toast.error(`Falha no render: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-label="Renderizar imagem" data-testid="render-dialog">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-white/10 bg-[#11151b] p-4 sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Camera size={18} className="text-cyan-300" />
          <h2 className={`font-semibold text-white ${p === 'tv' ? 'text-xl' : 'text-base'}`}>Renderizar imagem</h2>
          <button className="ml-auto rounded p-1 text-zinc-400 hover:bg-white/10" onClick={onClose} aria-label="Fechar" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <Segmented label="Tipo" value={kind} options={[{ id: 'imagem', label: 'Imagem' }, { id: 'folha', label: 'Folha de referência (6 vistas)' }]} onChange={(v) => setKind(v as 'imagem' | 'folha')} />
          <Segmented<SceneLook> label="Cena / iluminação" value={scene} options={(Object.keys(SCENE_LABELS) as SceneLook[]).map((id) => ({ id, label: SCENE_LABELS[id] }))} onChange={(v) => st().set({ scene: v })} />
          <Segmented<Resolution> label="Resolução" value={render.res} options={(Object.keys(RESOLUTIONS) as Resolution[]).map((id) => ({ id, label: RESOLUTIONS[id].label }))} onChange={(v) => st().set({ render: { ...render, res: v } })} />
          {kind === 'imagem' && <Segmented<Aspect> label="Proporção" value={render.aspect} options={(Object.keys(ASPECTS) as Aspect[]).map((id) => ({ id, label: id }))} onChange={(v) => st().set({ render: { ...render, aspect: v } })} />}
          <Segmented label="Formato" value={format} options={[{ id: 'jpg', label: 'JPEG (menor)' }, { id: 'png', label: 'PNG (sem perdas)' }]} onChange={(v) => setFormat(v as 'jpg' | 'png')} />
          <p className="text-xs text-zinc-400">
            {size.width} × {size.height} px · renderizado em blocos pela GPU do aparelho.
            {render.res === '8k' && ' Em celulares, 8K pode exceder a memória; 4K é o mais seguro.'}
          </p>
          {busy && (
            <div className="h-2 overflow-hidden rounded bg-white/10" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)}>
              <div className="h-full bg-cyan-400 transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
            </div>
          )}
          {preview && <img src={preview} alt="Prévia do render" className="w-full rounded-lg border border-white/10" data-testid="render-preview" />}
          <Btn variant="primary" className="w-full" onClick={run} disabled={busy} data-testid="render-run">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} {busy ? `Renderizando ${Math.round((progress ?? 0) * 100)}%` : 'Renderizar e baixar'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

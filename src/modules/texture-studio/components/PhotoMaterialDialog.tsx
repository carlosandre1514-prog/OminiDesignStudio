import { useRef, useState } from 'react';
import { downloadSizeMB } from '@/core/ai/models';
import { estimateDepth } from '@/core/ai/vision';
import { hasWebGPU } from '@/core/ai/runtime';
import { importAssetBytes, getAssetBlob } from '@/core/assets/assetService';
import { Modal } from '@/ui/Modal';
import { toast } from '@/ui/toast';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { decodeImage } from '@/modules/arsenal/lib/photo3d';
import { detailHeight, fieldToRgba, luminanceHeight, makeSeamless, makeSeamlessField, squareCrop } from '../engine/photoMaterial';
import { createLayer, createTextureDoc } from '../engine/types';
import { useTextures } from '../store';
import { encodePng } from './ExportTextures';

/**
 * Photo of a real surface → editable PBR material (Substance Sampler-style), on device:
 * square crop, seamless tiling, height from AI depth (Depth Anything V2) or luminance, then a layer stack
 * (photo colour + AI relief + roughness from relief + optional dirt in cavities) that stays editable.
 */
export function PhotoMaterialDialog({ onClose }: { onClose: () => void }) {
  const projectId = useTextures((s) => s.projectId);
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [useAI, setUseAI] = useState(true);
  const [seamless, setSeamless] = useState(true);
  const [metal, setMetal] = useState(false);
  const [relief, setRelief] = useState(0.18);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const preview = file ? URL.createObjectURL(file.blob) : null;

  const run = async () => {
    if (!file) return;
    try {
      setBusy('Lendo foto…');
      let img = squareCrop(await decodeImage(file.blob, 1024));
      if (seamless) img = makeSeamless(img);
      let height = luminanceHeight(img);
      let usedAI = false;
      if (useAI) {
        try {
          setBusy('IA: estimando o relevo da superfície…');
          height = await estimateDepth(img, ({ model, loaded, total }) => setBusy(`Baixando IA ${model}: ${(loaded / 1048576).toFixed(1)} de ${(total / 1048576).toFixed(1)} MB (só na 1ª vez)`));
          usedAI = true;
        } catch (e) {
          toast.info(`IA indisponível (${e instanceof Error ? e.message : e}); usei o brilho da foto para o relevo.`);
        }
      }
      setBusy('Gerando mapas…');
      if (seamless) height = makeSeamlessField(height);
      const h = detailHeight(height);
      const base = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'foto';
      const colorRes = await importAssetBytes(`material-${base}-cor.png`, await encodePng(img.data as Uint8ClampedArray, img.width), { name: `${base} — cor (foto)`, category: 'textures', tags: ['textura', 'foto'], projectId });
      const heightRes = await importAssetBytes(`material-${base}-altura.png`, await encodePng(fieldToRgba(h).data as Uint8ClampedArray, h.width), { name: `${base} — altura (${usedAI ? 'IA' : 'brilho'})`, category: 'textures', tags: ['textura', 'foto'], projectId });
      if (colorRes.status === 'error') throw new Error(colorRes.error);
      if (heightRes.status === 'error') throw new Error(heightRes.error);
      const layers = [
        createLayer('Foto (cor + relevo)', {
          heightMode: 'normal',
          channels: { color: true, height: true, roughness: true, metal: true },
          content: { imageId: colorRes.asset.id, heightImageId: heightRes.asset.id, colors: ['#ffffff'], heightAmount: relief, heightOffset: -relief / 2, roughA: metal ? 0.55 : 0.85, roughB: metal ? 0.28 : 0.55, metalA: metal ? 1 : 0, metalB: metal ? 1 : 0 },
        }),
        createLayer('Sujeira nas cavidades', { blend: 'multiply', opacity: 0.35, channels: { height: false, metal: false }, content: { colors: ['#5b5246'], roughA: 0.9, roughB: 0.9 }, mask: { kind: 'curvature', side: 'concave', amount: 0.5 } }),
      ];
      const st = useTextures.getState();
      st.apply((d) => ({ ...createTextureDoc(d.name === 'Nova textura' ? base : d.name, layers), resolution: d.resolution, previewShape: d.previewShape, previewTiling: Math.max(2, d.previewTiling), normalStrength: 1.4 }));
      toast.success(`Material criado da foto${usedAI ? ' com relevo por IA' : ''}. Todas as camadas continuam editáveis.`);
      onClose();
    } catch (e) {
      toast.error(`Falha ao criar o material: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      title="Material a partir de foto (IA)"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={!!busy}>Cancelar</button>
          <button className="btn-primary" onClick={run} disabled={!file || !!busy} data-testid="photo-material-run">
            {busy ? 'Processando…' : 'Gerar material'}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-xs text-ink-300">Fotografe uma superfície de frente, com luz uniforme (metal, madeira, couro, tecido, pedra, ferrugem…). A foto vira um material sem emenda com relevo, rugosidade e normal.</p>
        <div className="flex gap-2">
          <button className="btn-outline text-xs" onClick={() => input.current?.click()}>Escolher foto…</button>
          <button className="btn-ghost text-xs" onClick={() => setPicking(true)}>Da biblioteca…</button>
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="photo-material-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile({ blob: f, name: f.name });
              e.target.value = '';
            }}
          />
        </div>
        {preview && <img src={preview} alt="Foto escolhida" className="h-32 w-32 rounded border border-ink-700 object-cover" />}
        <label className="flex items-center gap-2 text-xs text-ink-200"><input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /> Relevo por IA no aparelho ({hasWebGPU() ? 'GPU' : 'CPU'}; ~{Math.round(downloadSizeMB(hasWebGPU()))} MB na 1ª vez, depois offline)</label>
        <label className="flex items-center gap-2 text-xs text-ink-200"><input type="checkbox" checked={seamless} onChange={(e) => setSeamless(e.target.checked)} /> Tornar sem emenda (repetível)</label>
        <label className="flex items-center gap-2 text-xs text-ink-200"><input type="checkbox" checked={metal} onChange={(e) => setMetal(e.target.checked)} /> É metal</label>
        <label className="block text-xs text-ink-300">
          Intensidade do relevo: {Math.round(relief * 100)}%
          <input type="range" min={0.02} max={0.4} step={0.01} value={relief} onChange={(e) => setRelief(Number(e.target.value))} className="w-full accent-accent-500" aria-label="Intensidade do relevo" />
        </label>
        {busy && <div className="rounded bg-ink-800 px-3 py-2 text-xs text-accent-400" role="status">{busy}</div>}
      </div>
      {picking && (
        <AssetPicker
          kinds={['image']}
          projectId={projectId}
          title="Foto da superfície"
          onClose={() => setPicking(false)}
          onPick={async (a) => {
            const blob = await getAssetBlob(a.id);
            if (blob) setFile({ blob, name: a.name });
            setPicking(false);
          }}
        />
      )}
    </Modal>
  );
}

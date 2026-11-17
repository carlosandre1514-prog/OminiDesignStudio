import JSZip from 'jszip';
import { useState } from 'react';
import { importAssetBytes } from '@/core/assets/assetService';
import { downloadBlob } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { Modal } from '@/ui/Modal';
import { toast } from '@/ui/toast';
import { MAP_LABELS, type TextureMaps } from '../engine/compose';
import { render } from '../engine/runner';
import { selectDoc, useTextures } from '../store';

type MapKey = Exclude<keyof TextureMaps, 'size'>;
const FILE_SUFFIX: Record<MapKey, string> = { baseColor: 'basecolor', roughness: 'roughness', metallic: 'metallic', normal: 'normal', height: 'height', ao: 'ao', emissive: 'emissive', orm: 'orm' };
const DEFAULT_ON: MapKey[] = ['baseColor', 'normal', 'roughness', 'metallic', 'ao', 'height'];

export async function encodePng(rgba: Uint8ClampedArray, size: number): Promise<ArrayBuffer> {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(rgba), size, size), 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('Falha ao gerar PNG');
  return blob.arrayBuffer();
}

/** Export the PBR maps at full resolution: ZIP download and/or Asset Library (for the 3D studio). */
export function ExportTextures({ onClose }: { onClose: () => void }) {
  const doc = useTextures(selectDoc);
  const projectId = useTextures((s) => s.projectId);
  const [size, setSize] = useState<number>(doc.resolution);
  const [maps, setMaps] = useState<Set<MapKey>>(new Set(DEFAULT_ON));
  const [progress, setProgress] = useState<number | null>(null);
  const base = slugify(doc.name, 'textura');

  const build = async () => {
    setProgress(0);
    const out = await render(doc, size, (p) => setProgress(p * 0.8));
    const files: [MapKey, ArrayBuffer][] = [];
    const list = [...maps];
    for (let i = 0; i < list.length; i++) {
      files.push([list[i], await encodePng(out[list[i]], out.size)]);
      setProgress(0.8 + (0.2 * (i + 1)) / list.length);
    }
    return files;
  };

  const zip = async () => {
    try {
      const files = await build();
      const z = new JSZip();
      for (const [k, data] of files) z.file(`${base}_${FILE_SUFFIX[k]}.png`, data);
      z.file(`${base}.omnitex.json`, JSON.stringify(doc, null, 2));
      z.file('LEIA-ME.txt', `Texturas PBR geradas no OmniDesign Studio (${size}×${size}).\nNormal: ${doc.normalFormat === 'opengl' ? 'OpenGL (Y+), padrão do Blender/Unity/three.js' : 'DirectX (Y−), padrão da Unreal'}.\nORM: R = oclusão, G = rugosidade, B = metálico (glTF).\n`);
      downloadBlob(await z.generateAsync({ type: 'blob' }), `${base}-pbr-${size}.zip`);
      toast.success('Texturas exportadas');
      onClose();
    } catch (e) {
      toast.error(`Falha ao exportar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
    }
  };

  const library = async () => {
    try {
      const files = await build();
      let n = 0;
      for (const [k, data] of files) {
        const r = await importAssetBytes(`${base}_${FILE_SUFFIX[k]}.png`, data, { name: `${doc.name} — ${MAP_LABELS[k]}`, category: 'textures', tags: ['textura', 'pbr', base], projectId });
        if (r.status === 'error') throw new Error(r.error);
        n++;
      }
      toast.success(`${n} mapas salvos na Asset Library (use no Estúdio 3D em Materiais)`);
      onClose();
    } catch (e) {
      toast.error(`Falha ao salvar: ${e instanceof Error ? e.message : e}`);
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <Modal
      open
      title="Exportar texturas PBR"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn-outline" onClick={library} disabled={busy || !maps.size} data-testid="tex-save-library">Salvar na biblioteca</button>
          <button className="btn-primary" onClick={zip} disabled={busy || !maps.size} data-testid="tex-download-zip">Baixar ZIP</button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <div className="label">Resolução</div>
          <div className="flex gap-2">
            {[512, 1024, 2048].map((s) => (
              <button key={s} className={`rounded-md border px-3 py-1.5 text-xs ${size === s ? 'border-accent-500 text-ink-100' : 'border-ink-700 text-ink-300'}`} onClick={() => setSize(s)} aria-pressed={size === s}>
                {s}×{s}
              </button>
            ))}
          </div>
          {size === 2048 && <p className="mt-1 text-[11px] text-amber-300">2048 px pode levar alguns segundos no celular.</p>}
        </div>
        <div>
          <div className="label">Mapas</div>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(MAP_LABELS) as MapKey[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-xs text-ink-200">
                <input
                  type="checkbox"
                  checked={maps.has(k)}
                  onChange={(e) => {
                    const next = new Set(maps);
                    if (e.target.checked) next.add(k);
                    else next.delete(k);
                    setMaps(next);
                  }}
                />
                {MAP_LABELS[k]}
              </label>
            ))}
          </div>
        </div>
        {busy && (
          <div className="h-2 overflow-hidden rounded bg-ink-800" role="progressbar" aria-valuenow={Math.round((progress ?? 0) * 100)}>
            <div className="h-full bg-accent-500 transition-all" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
          </div>
        )}
      </div>
    </Modal>
  );
}

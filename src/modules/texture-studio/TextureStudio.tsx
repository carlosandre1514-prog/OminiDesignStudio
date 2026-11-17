import { useEffect, useState } from 'react';
import type { ModuleEditorProps } from '@/core/modules/registry';
import { createVersion } from '@/core/projects/projectService';
import { toast } from '@/ui/toast';
import { DocSettings, LayerProps } from './components/LayerProps';
import { LayersPanel } from './components/LayersPanel';
import { ExportTextures } from './components/ExportTextures';
import { Preview2D } from './components/Preview2D';
import { Preview3D } from './components/Preview3D';
import { usePreview } from './components/usePreview';
import { PRESETS } from './engine/presets';
import { createTextureDoc } from './engine/types';
import { selectDoc, useTextures } from './store';

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

function SaveDot() {
  const s = useTextures((x) => x.saveStatus);
  const evaluating = useTextures((x) => x.evaluating);
  const map = { idle: ['bg-ink-600', 'Pronto'], dirty: ['bg-amber-400', 'Alterações pendentes'], saving: ['bg-amber-400 animate-pulse', 'Salvando…'], saved: ['bg-emerald-400', 'Salvo'], error: ['bg-red-500', 'Erro ao salvar'] } as const;
  const [c, t] = map[s];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-400" data-testid="tex-status">
      {evaluating && <span className="text-accent-400">Gerando…</span>}
      <span className={`h-2 w-2 rounded-full ${c}`} />
      <span className="hidden sm:inline">{t}</span>
    </span>
  );
}

/**
 * Estúdio de Texturas: layer-based PBR material authoring (Substance-style), entirely in the browser.
 * Layers = content (colour/gradient, roughness, metal, height, emissive, driven by procedural patterns
 * or images) × mask (pattern, brush painting, text/decals, image, curvature, height).
 */
export default function TextureStudio({ projectId }: ModuleEditorProps) {
  const { loading, loadError, load, unload } = useTextures();
  const doc = useTextures(selectDoc);
  const view = useTextures((s) => s.view);
  const canUndo = useTextures((s) => s.history.past.length > 0);
  const canRedo = useTextures((s) => s.history.future.length > 0);
  const [panel, setPanel] = useState<'layers' | 'props' | null>(null);
  const [exporting, setExporting] = useState(false);
  usePreview();

  useEffect(() => {
    void load(projectId);
    return () => void unload();
  }, [projectId, load, unload]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useTextures.getState().redo();
        else useTextures.getState().undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useTextures.getState().redo();
      } else if (e.key === '[' || e.key === ']') {
        const b = useTextures.getState().brush;
        useTextures.getState().set({ brush: { ...b, size: Math.min(0.4, Math.max(0.005, b.size * (e.key === ']' ? 1.25 : 0.8))) } });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) return <div className="p-8 text-sm text-red-300">Não foi possível abrir a textura: {loadError}</div>;
  if (loading) return <div className="p-8 text-sm text-ink-400">Carregando estúdio de texturas…</div>;

  const st = useTextures.getState;
  return (
    <div className="flex h-full flex-col" data-testid="texture-studio">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-800 bg-ink-900 px-2 py-1">
        <button className="icon-btn lg:hidden" onClick={() => setPanel(panel === 'layers' ? null : 'layers')} aria-label="Camadas">☰</button>
        <button className="icon-btn" disabled={!canUndo} onClick={() => st().undo()} aria-label="Desfazer" title="Desfazer (Ctrl+Z)">↶</button>
        <button className="icon-btn" disabled={!canRedo} onClick={() => st().redo()} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">↷</button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        <select
          className="input w-auto py-1 text-xs"
          aria-label="Material pronto"
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            if (!p) return;
            if (e.target.value && doc.layers.length > 1 && !confirm(`Substituir as camadas atuais pelo material "${p.name}"? (dá para desfazer)`)) return;
            st().apply((d) => ({ ...createTextureDoc(d.name, p.build()), resolution: d.resolution, previewShape: d.previewShape, previewTiling: d.previewTiling }));
            toast.success(`Material "${p.name}" aplicado`);
          }}
        >
          <option value="">Materiais prontos…</option>
          {(['Metais', 'Revestimentos', 'Orgânicos', 'Sintéticos', 'Sci-fi'] as const).map((g) => (
            <optgroup key={g} label={g}>
              {PRESETS.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          ))}
        </select>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        {(['3d', '2d'] as const).map((v) => (
          <button key={v} className="icon-btn w-auto px-2 text-xs" data-active={view === v} onClick={() => st().set({ view: v })}>
            {v === '3d' ? 'Vista 3D' : 'Mapas 2D'}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 pl-2">
          <SaveDot />
          <button className="btn-ghost text-xs" onClick={async () => { await st().saveNow(); await createVersion(projectId, `Manual ${new Date().toLocaleString('pt-BR')}`); toast.success('Ponto de restauração criado'); }}>Salvar versão</button>
          <button className="btn-primary text-xs" onClick={() => setExporting(true)} data-testid="tex-export">Exportar</button>
          <button className="icon-btn lg:hidden" onClick={() => setPanel(panel === 'props' ? null : 'props')} aria-label="Propriedades">⚙</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${panel === 'layers' ? 'absolute inset-y-0 left-0 z-30 flex shadow-2xl' : 'hidden'} w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 lg:static lg:flex`}>
          <LayersPanel />
        </aside>
        <main className="relative min-w-0 flex-1 bg-ink-950">{view === '3d' ? <Preview3D /> : <Preview2D />}</main>
        <aside className={`${panel === 'props' ? 'absolute inset-y-0 right-0 z-30 block shadow-2xl' : 'hidden'} w-80 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900 lg:static lg:block`} data-testid="tex-props">
          <LayerProps />
          <DocSettings />
        </aside>
      </div>
      {exporting && <ExportTextures onClose={() => setExporting(false)} />}
    </div>
  );
}

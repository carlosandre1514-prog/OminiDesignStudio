import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '@/core/db/database';
import { createVersion } from '@/core/projects/projectService';
import type { ModuleEditorProps } from '@/core/modules/registry';
import { toast } from '@/ui/toast';
import { Canvas } from './components/Canvas';
import { ExportDialog } from './components/ExportDialog';
import { LeftPanel } from './components/LeftPanel';
import { PreviewMode } from './components/PreviewMode';
import { PropertiesPanel } from './components/PropertiesPanel';
import * as ops from './ops';
import { copySelection, hasClipboard, pasteClipboard, selectDoc, selectScreen, useWebDesign } from './store';
import { useView } from './viewStore';

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

function fitToScreen() {
  const st = useWebDesign.getState();
  const s = selectScreen(st);
  const canvas = document.querySelector('[data-testid="wd-canvas"]');
  if (!canvas) return;
  const r = canvas.getBoundingClientRect();
  const zoom = Math.min(4, Math.max(0.05, Math.min((r.width - 80) / s.width, (r.height - 80) / s.height)));
  useView.getState().setView({ zoom, panX: (r.width - s.width * zoom) / 2, panY: Math.max(40, (r.height - s.height * zoom) / 2) });
}

function SaveIndicator() {
  const status = useWebDesign((s) => s.saveStatus);
  const err = useWebDesign((s) => s.saveError);
  const map = {
    idle: ['bg-ink-600', 'Pronto'],
    dirty: ['bg-amber-400', 'Alterações pendentes'],
    saving: ['bg-amber-400 animate-pulse', 'Salvando…'],
    saved: ['bg-emerald-400', 'Salvo localmente'],
    error: ['bg-red-500', 'Erro ao salvar'],
  } as const;
  const [cls, text] = map[status];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-400" title={err ?? undefined}>
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      <span className="hidden sm:inline">{text}</span>
    </span>
  );
}

export default function WebDesignStudio({ projectId }: ModuleEditorProps) {
  const load = useWebDesign((s) => s.load);
  const unload = useWebDesign((s) => s.unload);
  const loading = useWebDesign((s) => s.loading);
  const loadError = useWebDesign((s) => s.loadError);
  const canUndo = useWebDesign((s) => s.history.past.length > 0);
  const canRedo = useWebDesign((s) => s.history.future.length > 0);
  const doc = useWebDesign(selectDoc);
  const activeScreenId = useWebDesign((s) => s.activeScreenId);
  const selection = useWebDesign((s) => s.selection);
  const { zoom, tool, showRulers } = useView();
  const projectName = useLiveQuery(() => db.projects.get(projectId).then((p) => p?.name ?? 'projeto'), [projectId]) ?? 'projeto';
  const [preview, setPreview] = useState<null | 'proto' | 'showcase'>(null);
  const [exporting, setExporting] = useState(false);
  const [panel, setPanel] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    void load(projectId).then(() => requestAnimationFrame(fitToScreen));
    const flush = () => void useWebDesign.getState().saveNow();
    window.addEventListener('beforeunload', flush);
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
      void unload();
    };
  }, [projectId, load, unload]);

  useEffect(() => {
    requestAnimationFrame(fitToScreen);
  }, [activeScreenId]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (preview || isTyping(e.target) || useView.getState().editingTextId) return;
      const st = useWebDesign.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const sel = st.selection;
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && k === 's') {
        e.preventDefault();
        void st.saveNow().then(() => toast.success('Projeto salvo'));
      } else if (mod && k === 'c') {
        if (copySelection()) e.preventDefault();
      } else if (mod && k === 'x') {
        if (copySelection(true)) e.preventDefault();
      } else if (mod && k === 'v') {
        if (hasClipboard()) {
          e.preventDefault();
          pasteClipboard();
        }
      } else if (mod && k === 'd') {
        e.preventDefault();
        if (!sel.length) return;
        let ids: string[] = [];
        st.applyScreen((s) => {
          const r = ops.duplicateElements(s, sel);
          ids = r.newIds;
          return r.screen;
        });
        st.select(ids);
      } else if (mod && k === 'a') {
        e.preventDefault();
        st.select(selectScreen(st).elements.filter((x) => !x.parentId && !x.locked).map((x) => x.id));
      } else if (mod && k === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          let freed: string[] = [];
          st.applyScreen((s) => {
            const r = ops.ungroupElements(s, sel);
            freed = r.freed;
            return r.screen;
          });
          if (freed.length) st.select(freed);
        } else {
          let gid: string | undefined;
          st.applyScreen((s) => {
            const r = ops.groupElements(s, sel);
            gid = r.groupId;
            return r.screen;
          });
          if (gid) st.select([gid]);
        }
      } else if (k === 'delete' || k === 'backspace') {
        if (!sel.length) return;
        e.preventDefault();
        st.applyScreen((s) => ops.deleteElements(s, sel));
        st.select([]);
      } else if (k === 'escape') {
        st.select([]);
      } else if (k.startsWith('arrow') && sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
        const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
        st.applyScreen((s) => ops.translateElements(s, sel, dx, dy));
      } else if (!mod && k === 'h') {
        useView.getState().setTool('hand');
      } else if (!mod && k === 'v') {
        useView.getState().setTool('select');
      } else if (!mod && (k === '+' || k === '=')) {
        zoomBy(1.2);
      } else if (!mod && k === '-') {
        zoomBy(1 / 1.2);
      } else if (e.shiftKey && k === '1') {
        fitToScreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  if (loadError) return <div className="p-8 text-sm text-red-300">Erro ao carregar o projeto: {loadError}</div>;
  if (loading) return <div className="p-8 text-sm text-ink-400">Carregando editor…</div>;

  const st = useWebDesign.getState();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-800 bg-ink-900 px-2 py-1">
        <button className="icon-btn lg:hidden" onClick={() => setPanel(panel === 'left' ? null : 'left')} aria-label="Telas e camadas" title="Telas e camadas">☰</button>
        <button className="icon-btn" data-active={tool === 'select'} onClick={() => useView.getState().setTool('select')} title="Selecionar (V)" aria-label="Ferramenta de seleção">➤</button>
        <button className="icon-btn" data-active={tool === 'hand'} onClick={() => useView.getState().setTool('hand')} title="Mover visualização (H ou Espaço)" aria-label="Ferramenta mão">✋</button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        <button className="icon-btn" disabled={!canUndo} onClick={st.undo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
        <button className="icon-btn" disabled={!canRedo} onClick={st.redo} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        <button className="icon-btn" disabled={!selection.length} onClick={() => copySelection()} title="Copiar (Ctrl+C)" aria-label="Copiar">⎘</button>
        <button className="icon-btn" onClick={() => pasteClipboard()} title="Colar (Ctrl+V)" aria-label="Colar">📋</button>
        <button
          className="icon-btn"
          disabled={!selection.length}
          title="Duplicar (Ctrl+D)"
          aria-label="Duplicar"
          onClick={() => {
            let ids: string[] = [];
            st.applyScreen((s) => {
              const r = ops.duplicateElements(s, st.selection);
              ids = r.newIds;
              return r.screen;
            });
            st.select(ids);
          }}
        >
          ⧉
        </button>
        <button className="icon-btn" disabled={!selection.length} onClick={() => { st.applyScreen((s) => ops.deleteElements(s, st.selection)); st.select([]); }} title="Excluir (Delete)" aria-label="Excluir">🗑</button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        <button className="icon-btn" onClick={() => zoomBy(1 / 1.2)} title="Diminuir zoom (-)" aria-label="Diminuir zoom">−</button>
        <button className="min-w-12 rounded px-1 text-xs text-ink-300 hover:bg-ink-800" onClick={fitToScreen} title="Ajustar à tela (Shift+1)">{Math.round(zoom * 100)}%</button>
        <button className="icon-btn" onClick={() => zoomBy(1.2)} title="Aumentar zoom (+)" aria-label="Aumentar zoom">+</button>
        <button className="icon-btn" data-active={showRulers} onClick={() => useView.getState().toggleRulers()} title="Réguas" aria-label="Mostrar réguas">📏</button>
        <button className="icon-btn" data-active={doc.grid.show} onClick={() => st.apply((d) => ({ ...d, grid: { ...d.grid, show: !d.grid.show } }))} title="Grid" aria-label="Mostrar grid">#</button>
        <div className="ml-auto flex items-center gap-1.5 pl-2">
          <SaveIndicator />
          <button
            className="btn-ghost text-xs"
            title="Criar ponto de restauração"
            onClick={async () => {
              await st.saveNow();
              await createVersion(projectId, `Manual ${new Date().toLocaleString('pt-BR')}`);
              toast.success('Ponto de restauração criado');
            }}
          >
            Salvar versão
          </button>
          <button className="btn-ghost text-xs" onClick={() => setPreview('showcase')} title="Apresentação em tela limpa">Apresentar</button>
          <button className="btn-outline text-xs" onClick={() => setPreview('proto')}>▶ Protótipo</button>
          <button className="btn-primary text-xs" onClick={() => setExporting(true)}>Exportar</button>
          <button className="icon-btn lg:hidden" onClick={() => setPanel(panel === 'right' ? null : 'right')} aria-label="Propriedades" title="Propriedades">⚙</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${panel === 'left' ? 'absolute inset-y-0 left-0 z-30 flex shadow-2xl' : 'hidden'} w-64 shrink-0 flex-col border-r border-ink-800 bg-ink-900 lg:static lg:flex`}>
          <LeftPanel />
        </aside>
        <div className="min-w-0 flex-1">
          <Canvas />
        </div>
        <aside className={`${panel === 'right' ? 'absolute inset-y-0 right-0 z-30 block shadow-2xl' : 'hidden'} w-72 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900 lg:static lg:block`}>
          <PropertiesPanel />
        </aside>
      </div>
      {preview && <PreviewMode doc={doc} startScreenId={preview === 'showcase' ? doc.screens[0].id : activeScreenId} showcase={preview === 'showcase'} onClose={() => setPreview(null)} />}
      {exporting && <ExportDialog doc={doc} projectName={projectName} onClose={() => setExporting(false)} />}
    </div>
  );
}

function zoomBy(f: number) {
  const canvas = document.querySelector('[data-testid="wd-canvas"]');
  const r = canvas?.getBoundingClientRect();
  useView.getState().zoomAt(f, (r?.width ?? 800) / 2, (r?.height ?? 600) / 2);
}

import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/core/db/database';
import type { ModuleEditorProps } from '@/core/modules/registry';
import { createVersion } from '@/core/projects/projectService';
import { toast } from '@/ui/toast';
import { ExportDialog3D } from './components/ExportDialog3D';
import { Inspector } from './components/Inspector';
import { Outliner } from './components/Outliner';
import { Viewport } from './components/Viewport';
import * as P from './mesh/polyMesh';
import * as ops from './ops';
import { convertModels, openPaintProject, paintableIds } from './paint3d';
import { selectEditObject, selectScene, selectedVertexIds, useStudio3D, type GizmoMode, type ViewShading } from './store';

const WeaponGenerator = lazy(() => import('./components/WeaponGenerator').then((m) => ({ default: m.WeaponGenerator })));

const isTyping = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
const st = () => useStudio3D.getState();

const VIEWS: { id: string; label: string; position: P.Vec3 }[] = [
  { id: 'persp', label: 'Perspectiva', position: [4, 3, 5] },
  { id: 'front', label: 'Frente', position: [0, 1, 8] },
  { id: 'right', label: 'Direita', position: [8, 1, 0] },
  { id: 'top', label: 'Topo', position: [0, 10, 0.001] },
];

function SaveDot() {
  const s = useStudio3D((x) => x.saveStatus);
  const map = { idle: ['bg-ink-600', 'Pronto'], dirty: ['bg-amber-400', 'Alterações pendentes'], saving: ['bg-amber-400 animate-pulse', 'Salvando…'], saved: ['bg-emerald-400', 'Salvo localmente'], error: ['bg-red-500', 'Erro ao salvar'] } as const;
  const [c, t] = map[s];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-400">
      <span className={`h-2 w-2 rounded-full ${c}`} />
      <span className="hidden sm:inline">{t}</span>
    </span>
  );
}

function deleteSelection() {
  const s = st();
  if (s.mode === 'edit') {
    const o = selectEditObject(s);
    if (o?.geometry?.kind !== 'mesh') return;
    const sel = s.editSel;
    s.editMesh((m) => (sel.mode === 'face' ? P.deleteFaces(m, sel.faces) : P.deleteVertices(m, selectedVertexIds(sel, m))));
    return;
  }
  if (!s.selection.length) return;
  s.apply((d) => ops.deleteObjects(d, s.selection));
  s.select([]);
}

export default function Studio3D({ projectId }: ModuleEditorProps) {
  const loading = useStudio3D((s) => s.loading);
  const loadError = useStudio3D((s) => s.loadError);
  const canUndo = useStudio3D((s) => s.history.past.length > 0);
  const canRedo = useStudio3D((s) => s.history.future.length > 0);
  const gizmo = useStudio3D((s) => s.gizmo);
  const space = useStudio3D((s) => s.space);
  const snap = useStudio3D((s) => s.snap);
  const shading = useStudio3D((s) => s.shading);
  const mode = useStudio3D((s) => s.mode);
  const presenting = useStudio3D((s) => s.presenting);
  const ortho = useStudio3D((s) => selectScene(s).camera.orthographic);
  const projectName = useLiveQuery(() => db.projects.get(projectId).then((p) => p?.name ?? 'cena'), [projectId]) ?? 'cena';
  const navigate = useNavigate();
  const [paintBusy, setPaintBusy] = useState(false);
  /** Open the 3D painting tool (texture studio) on the selection, or on every visible mesh. */
  const paint3D = async () => {
    const s = st();
    const doc = selectScene(s);
    const ids = paintableIds(doc, s.selection);
    if (!ids.length) return toast.error('Nada para pintar: adicione ou selecione uma malha/modelo.');
    setPaintBusy(true);
    try {
      if (ids.some((id) => doc.objects.find((o) => o.id === id)?.type === 'model')) {
        const next = await convertModels(doc, ids);
        s.apply(() => next);
        toast.info('Modelos importados convertidos em malha para receber a pintura.');
      }
      await st().saveNow();
      const first = doc.objects.find((o) => o.id === ids[0]);
      const name = ids.length === 1 ? first?.name ?? 'objeto' : projectName;
      const id = await openPaintProject(projectId, projectName, ids, name);
      navigate(`/project/${id}/texture-studio`);
    } catch (e) {
      toast.error(`Não foi possível abrir a pintura 3D: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPaintBusy(false);
    }
  };
  const [exporting, setExporting] = useState(false);
  const [panel, setPanel] = useState<'left' | 'right' | null>(null);
  const [weapons, setWeapons] = useState(false);

  useEffect(() => {
    void st().load(projectId);
    const flush = () => void st().saveNow();
    window.addEventListener('beforeunload', flush);
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onHide);
      void st().unload();
    };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const s = st();
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (s.presenting) {
        if (k === 'escape') s.set({ presenting: false });
        return;
      }
      if (mod && k === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && k === 'y') {
        e.preventDefault();
        s.redo();
      } else if (mod && k === 's') {
        e.preventDefault();
        void s.saveNow().then(() => toast.success('Cena salva'));
      } else if (mod && k === 'd' && s.mode === 'object' && s.selection.length) {
        e.preventDefault();
        let n: string[] = [];
        s.apply((d) => {
          const r = ops.duplicateObjects(d, s.selection);
          n = r.newIds;
          return r.doc;
        });
        s.select(n);
      } else if (mod && k === 'g' && s.mode === 'object') {
        e.preventDefault();
        let g: string | undefined;
        s.apply((d) => {
          const r = ops.groupObjects(d, s.selection);
          g = r.groupId;
          return r.doc;
        });
        if (g) s.select([g]);
      } else if (mod && k === 'j' && s.mode === 'object') {
        e.preventDefault();
        let id: string | undefined;
        s.apply((d) => {
          const r = ops.joinMeshes(d, s.selection);
          id = r.id;
          return r.doc;
        });
        if (id) s.select([id]);
      } else if (k === 'tab') {
        e.preventDefault();
        s.setMode(s.mode === 'edit' ? 'object' : 'edit');
      } else if (k === 'delete' || k === 'backspace' || k === 'x') {
        e.preventDefault();
        deleteSelection();
      } else if (k === 'w') s.set({ gizmo: 'translate' });
      else if (k === 'e' && s.mode === 'edit' && s.editSel.mode === 'face' && s.editSel.faces.length) {
        s.editMesh((m) => {
          const r = P.extrudeFaces(m, s.editSel.faces, 0.5);
          return { mesh: r.mesh, select: { faces: r.faces } };
        });
      } else if (k === 'e') s.set({ gizmo: 'rotate' });
      else if (k === 'i' && s.mode === 'edit' && s.editSel.faces.length) {
        s.editMesh((m) => {
          const r = P.insetFaces(m, s.editSel.faces, 0.25);
          return { mesh: r.mesh, select: { faces: r.faces } };
        });
      } else if (k === 'r') s.set({ gizmo: 'scale' });
      else if (s.mode === 'edit' && (k === '1' || k === '2' || k === '3')) s.setEditSel({ mode: k === '1' ? 'vertex' : k === '2' ? 'edge' : 'face', vertices: [], edges: [], faces: [] });
      else if (k === 'a' && s.mode === 'edit') {
        const o = selectEditObject(s);
        if (o?.geometry?.kind === 'mesh') {
          const m = o.geometry.mesh;
          s.setEditSel({ faces: m.f.map((_, i) => i), vertices: Array.from({ length: P.vcount(m) }, (_, i) => i), edges: P.edges(m).map((x) => [x.a, x.b] as [number, number]) });
        }
      } else if (k === 'a' && s.mode === 'object' && !mod) s.select(s.history.present.objects.filter((o) => !o.locked).map((o) => o.id));
      else if (k === 'escape') {
        if (s.mode === 'edit') s.setEditSel({ vertices: [], edges: [], faces: [] });
        else s.select([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) return <div className="p-8 text-sm text-red-300">Erro ao carregar a cena: {loadError}</div>;
  if (loading) return <div className="p-8 text-sm text-ink-400">Carregando 3D Studio…</div>;

  if (presenting)
    return (
      <div className="fixed inset-0 z-50 bg-black" role="dialog" aria-label="Apresentação 3D">
        <Viewport presenting />
        <div className="absolute right-3 top-3 flex gap-2">
          <button className="btn-outline bg-black/50 text-xs" onClick={async () => {
            const url = await st().capture?.({ scale: 2 });
            if (url) {
              const a = document.createElement('a');
              a.href = url;
              a.download = 'apresentacao.png';
              a.click();
            }
          }}>Capturar imagem</button>
          <button className="btn-outline bg-black/50 text-xs" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>Tela cheia</button>
          <button className="btn-outline bg-black/50 text-xs" onClick={() => st().set({ presenting: false })}>Fechar (Esc)</button>
        </div>
      </div>
    );

  const tbtn = (active: boolean, label: string, title: string, onClick: () => void) => (
    <button className="icon-btn w-auto px-2 text-xs" data-active={active} title={title} aria-label={title} onClick={onClick}>{label}</button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-ink-800 bg-ink-900 px-2 py-1">
        <button className="icon-btn lg:hidden" onClick={() => setPanel(panel === 'left' ? null : 'left')} aria-label="Hierarquia">☰</button>
        <button className="icon-btn" disabled={!canUndo} onClick={() => st().undo()} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">↶</button>
        <button className="icon-btn" disabled={!canRedo} onClick={() => st().redo()} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">↷</button>
        <span className="mx-1 h-5 w-px bg-ink-700" />
        {(['translate', 'rotate', 'scale'] as GizmoMode[]).map((g, i) => tbtn(gizmo === g, ['Mover', 'Girar', 'Escalar'][i], `${['Mover', 'Girar', 'Escalar'][i]} (${'WER'[i]})`, () => st().set({ gizmo: g })))}
        {tbtn(space === 'local', space === 'local' ? 'Local' : 'Global', 'Eixos do gizmo: global ou local', () => st().set({ space: space === 'local' ? 'world' : 'local' }))}
        {tbtn(snap, 'Snap', 'Ajuste: 0,25 un. / 15° / 0,1', () => st().set({ snap: !snap }))}
        <span className="mx-1 h-5 w-px bg-ink-700" />
        {tbtn(mode === 'edit', mode === 'edit' ? 'Modo edição' : 'Modo objeto', 'Alternar objeto/edição (Tab)', () => st().setMode(mode === 'edit' ? 'object' : 'edit'))}
        <span className="mx-1 h-5 w-px bg-ink-700" />
        {(['wireframe', 'solid', 'material'] as ViewShading[]).map((v, i) => tbtn(shading === v, ['Wire', 'Sólido', 'Material'][i], `Visualização: ${['Wireframe', 'Sólido', 'Material'][i]}`, () => st().set({ shading: v })))}
        <span className="mx-1 h-5 w-px bg-ink-700" />
        {tbtn(ortho, ortho ? 'Orto' : 'Persp', 'Alternar perspectiva/ortográfica', () => st().setCamera({ orthographic: !ortho }, true))}
        <select
          className="input w-auto py-1 text-xs"
          aria-label="Vista"
          value=""
          onChange={(e) => {
            const v = VIEWS.find((x) => x.id === e.target.value);
            if (v) st().setCamera({ position: v.position, target: [0, 0.5, 0], orthographic: v.id === 'persp' ? false : ortho }, true);
          }}
        >
          <option value="">Vista…</option>
          {VIEWS.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-1.5 pl-2">
          <SaveDot />
          <button className="btn-outline text-xs" onClick={paint3D} disabled={paintBusy} data-testid="paint-3d" title="Pintar texturas direto no modelo (camadas, pincéis, materiais PBR, desgaste automático)">
            {paintBusy ? 'Preparando…' : '🖌 Pintar em 3D'}
          </button>
          <button className="btn-ghost text-xs" onClick={async () => { await st().saveNow(); await createVersion(projectId, `Manual ${new Date().toLocaleString('pt-BR')}`); toast.success('Ponto de restauração criado'); }}>Salvar versão</button>
          <button className="btn-ghost text-xs" onClick={() => st().set({ presenting: true })}>Apresentar</button>
          <button className="btn-primary text-xs" onClick={() => setExporting(true)}>Exportar</button>
          <button className="icon-btn lg:hidden" onClick={() => setPanel(panel === 'right' ? null : 'right')} aria-label="Propriedades">⚙</button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1">
        <aside className={`${panel === 'left' ? 'absolute inset-y-0 left-0 z-30 flex shadow-2xl' : 'hidden'} w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900 lg:static lg:flex`}>
          <Outliner />
        </aside>
        <div className="relative min-w-0 flex-1 bg-ink-950" data-testid="viewport-wrap">
          <Viewport />
          <button className="btn-primary absolute bottom-3 left-3 z-10 text-xs shadow-lg lg:hidden" onClick={() => setWeapons(true)} data-testid="weapon-fab">⚔ Gerar arma</button>
          {weapons && (
            <Suspense fallback={null}>
              <WeaponGenerator onClose={() => setWeapons(false)} />
            </Suspense>
          )}
          {mode === 'edit' && <div className="pointer-events-none absolute left-3 top-3 rounded bg-amber-500/90 px-2 py-0.5 text-xs font-medium text-black">Modo edição</div>}
        </div>
        <aside className={`${panel === 'right' ? 'absolute inset-y-0 right-0 z-30 block shadow-2xl' : 'hidden'} w-72 shrink-0 overflow-y-auto border-l border-ink-800 bg-ink-900 lg:static lg:block`} data-testid="inspector-3d">
          <Inspector />
        </aside>
      </div>
      {exporting && <ExportDialog3D projectName={projectName} onClose={() => setExporting(false)} />}
    </div>
  );
}

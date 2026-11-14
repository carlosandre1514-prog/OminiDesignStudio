import { useState } from 'react';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { toast } from '@/ui/toast';
import { mergeComponents, publishComponent, readComponentAsset } from '../componentAssets';
import { createElement, ELEMENT_LABELS, INSERTABLE, type ElementType, type WDElement, type WDScreen } from '../model';
import * as ops from '../ops';
import { selectDoc, selectScreen, useWebDesign } from '../store';
import { useView } from '../viewStore';

const ICONS: Record<ElementType, string> = {
  frame: '▭', ellipse: '◯', text: 'T', button: '⬭', image: '🖼', icon: '★', input: '⌨', card: '▤', navbar: '☰', menu: '≡', modal: '⧉', group: '⊞', instance: '◆',
};

/** Insert a new element centred in the visible part of the artboard. */
export function insertElement(type: ElementType) {
  const st = useWebDesign.getState();
  const s = selectScreen(st);
  const v = useView.getState();
  const canvas = document.querySelector('[data-testid="wd-canvas"]');
  const r = canvas?.getBoundingClientRect();
  const proto = createElement(type, 0, 0);
  let cx = s.width / 2;
  let cy = s.height / 2;
  if (r) {
    cx = Math.min(s.width - proto.w / 2, Math.max(proto.w / 2, (r.width / 2 - v.panX) / v.zoom));
    cy = Math.min(s.height - proto.h / 2, Math.max(proto.h / 2, (r.height / 2 - v.panY) / v.zoom));
  }
  const grid = st.history.present.grid;
  let x = Math.round(cx - proto.w / 2);
  let y = Math.round(cy - proto.h / 2);
  if (grid.snap) {
    x = ops.snapValue(x, grid.size);
    y = ops.snapValue(y, grid.size);
  }
  // Navbars span the whole screen width by default.
  const el = type === 'navbar' ? { ...proto, x: 0, y: 0, w: s.width } : { ...proto, x, y };
  // Keep a unique readable name.
  const count = s.elements.filter((e) => e.type === type).length;
  if (count) el.name = `${el.name} ${count + 1}`;
  st.applyScreen((sc) => ops.addElements(sc, [el]));
  st.select([el.id]);
}

function ScreensSection() {
  const doc = useWebDesign(selectDoc);
  const active = useWebDesign((s) => s.activeScreenId);
  const { apply, setActiveScreen } = useWebDesign.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  return (
    <section className="border-b border-ink-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="section-title">Telas</span>
        <button
          className="icon-btn h-6 w-6"
          title="Nova tela"
          aria-label="Nova tela"
          onClick={() => {
            let id = '';
            apply((d) => {
              const r = ops.addScreen(d);
              id = r.screen.id;
              return r.doc;
            });
            setActiveScreen(id);
          }}
        >
          +
        </button>
      </div>
      <ul className="space-y-0.5">
        {doc.screens.map((s: WDScreen, i) => (
          <li key={s.id} className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${s.id === active ? 'bg-accent-500/15 text-accent-400' : 'text-ink-300 hover:bg-ink-800'}`}>
            {renaming === s.id ? (
              <input
                className="input py-0.5"
                autoFocus
                defaultValue={s.name}
                onBlur={(e) => {
                  const name = e.target.value.trim() || s.name;
                  apply((d) => ops.updateScreen(d, s.id, (sc) => ({ ...sc, name })));
                  setRenaming(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            ) : (
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveScreen(s.id)} onDoubleClick={() => setRenaming(s.id)}>
                {s.name}
              </button>
            )}
            <span className="hidden gap-0.5 group-hover:flex">
              <button className="text-xs text-ink-400 hover:text-ink-100" title="Mover para cima" disabled={i === 0} onClick={() => apply((d) => ops.moveScreen(d, s.id, -1))}>↑</button>
              <button className="text-xs text-ink-400 hover:text-ink-100" title="Mover para baixo" disabled={i === doc.screens.length - 1} onClick={() => apply((d) => ops.moveScreen(d, s.id, 1))}>↓</button>
              <button className="text-xs text-ink-400 hover:text-ink-100" title="Renomear" onClick={() => setRenaming(s.id)}>✎</button>
              <button
                className="text-xs text-ink-400 hover:text-ink-100"
                title="Duplicar tela"
                onClick={() => {
                  let id = '';
                  apply((d) => {
                    const r = ops.duplicateScreen(d, s.id);
                    id = r.screen?.id ?? '';
                    return r.doc;
                  });
                  if (id) setActiveScreen(id);
                }}
              >
                ⧉
              </button>
              <button
                className="text-xs text-ink-400 hover:text-red-300 disabled:opacity-30"
                title="Excluir tela"
                disabled={doc.screens.length <= 1}
                onClick={() => confirm(`Excluir a tela "${s.name}"?`) && apply((d) => ops.removeScreen(d, s.id))}
              >
                ✕
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Place an instance of a component centred in the visible part of the current frame. */
export function insertInstanceCentered(compId: string) {
  const st = useWebDesign.getState();
  const doc = st.history.present;
  const comp = doc.components.find((c) => c.id === compId);
  if (!comp) return;
  if (!ops.canInsertInstance(doc, st.activeScreenId, compId)) {
    toast.error('Um componente não pode conter uma instância de si mesmo.');
    return;
  }
  const s = selectScreen(st);
  const v = useView.getState();
  const r = document.querySelector('[data-testid="wd-canvas"]')?.getBoundingClientRect();
  const cx = r ? (r.width / 2 - v.panX) / v.zoom : s.width / 2;
  const cy = r ? (r.height / 2 - v.panY) / v.zoom : s.height / 2;
  const x = Math.round(Math.min(Math.max(0, cx - comp.width / 2), Math.max(0, s.width - comp.width)));
  const y = Math.round(Math.min(Math.max(0, cy - comp.height / 2), Math.max(0, s.height - comp.height)));
  const inst = createElement('instance', x, y, { w: comp.width, h: comp.height, componentId: compId, name: comp.name });
  // Through applyScreen so that breakpoint projection/write-back applies.
  st.applyScreen((frame) => ops.addElements(frame, [inst]));
  st.select([inst.id]);
}

function ComponentsSection() {
  const doc = useWebDesign(selectDoc);
  const active = useWebDesign((s) => s.activeScreenId);
  const projectId = useWebDesign((s) => s.projectId);
  const { apply, setActiveScreen } = useWebDesign.getState();
  const [picking, setPicking] = useState(false);
  return (
    <section className="border-b border-ink-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="section-title">Componentes</span>
        <button className="text-[11px] text-accent-400 hover:underline" onClick={() => setPicking(true)} title="Inserir um componente salvo na Asset Library">Da biblioteca…</button>
      </div>
      {doc.components.length === 0 && <p className="text-[11px] leading-relaxed text-ink-400">Selecione elementos e use "Criar componente" (Ctrl+Alt+K) no painel de propriedades.</p>}
      <ul className="space-y-0.5">
        {doc.components.map((c) => {
          const uses = [...doc.screens, ...doc.components].reduce((n, f) => n + f.elements.filter((e) => e.type === 'instance' && e.componentId === c.id).length, 0);
          return (
            <li key={c.id} className={`group flex items-center gap-1 rounded px-2 py-1 text-sm ${c.id === active ? 'bg-accent-500/15 text-accent-400' : 'text-ink-300 hover:bg-ink-800'}`}>
              <span className="text-xs">◆</span>
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => setActiveScreen(c.id)} title="Editar o componente mestre">{c.name}</button>
              <span className="text-[10px] text-ink-400" title="Instâncias">{uses}</span>
              <span className="hidden gap-1 group-hover:flex">
                <button className="text-xs text-ink-400 hover:text-ink-100" title="Inserir instância na tela atual" onClick={() => insertInstanceCentered(c.id)}>＋</button>
                <button
                  className="text-xs text-ink-400 hover:text-ink-100"
                  title="Salvar na Asset Library"
                  onClick={async () => {
                    const r = await publishComponent(doc, c.id, projectId);
                    if (!r || r.status === 'error') toast.error(`Não foi possível salvar: ${r && r.status === 'error' ? r.error : 'componente inválido'}`);
                    else toast.success(r.status === 'duplicate' ? 'Este componente já está na biblioteca (sem alterações)' : `"${c.name}" salvo na biblioteca`);
                  }}
                >
                  ⇪
                </button>
                <button
                  className="text-xs text-ink-400 hover:text-red-300"
                  title="Excluir componente (as instâncias viram elementos comuns)"
                  onClick={() => {
                    if (!confirm(`Excluir o componente "${c.name}"? ${uses} instância(s) serão convertidas em elementos independentes.`)) return;
                    if (active === c.id) setActiveScreen(doc.screens[0].id);
                    apply((d) => ops.deleteComponent(d, c.id));
                  }}
                >
                  ✕
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {picking && (
        <AssetPicker
          kinds={['component']}
          projectId={projectId}
          title="Inserir componente da biblioteca"
          onClose={() => setPicking(false)}
          onPick={async (asset) => {
            const res = await readComponentAsset(asset.id);
            if (!res) return toast.error('Arquivo de componente inválido');
            apply((d) => mergeComponents(d, res.components));
            insertInstanceCentered(res.rootId);
          }}
        />
      )}
    </section>
  );
}

function InsertSection() {
  return (
    <section className="border-b border-ink-800 p-3">
      <div className="section-title mb-2">Inserir</div>
      <div className="grid grid-cols-4 gap-1">
        {INSERTABLE.map((t) => (
          <button key={t} className="flex flex-col items-center gap-0.5 rounded p-1.5 text-ink-300 hover:bg-ink-800 hover:text-ink-100" title={ELEMENT_LABELS[t]} onClick={() => insertElement(t)}>
            <span className="text-base leading-none">{ICONS[t]}</span>
            <span className="w-full truncate text-center text-[10px]">{ELEMENT_LABELS[t]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function LayerRow({ el, depth, screen }: { el: WDElement; depth: number; screen: WDScreen }) {
  const selected = useWebDesign((s) => s.selection.includes(el.id));
  const { select, applyScreen } = useWebDesign.getState();
  const [open, setOpen] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const kids = ops.childrenOf(screen, el.id);
  return (
    <>
      <li
        className={`group flex items-center gap-1 rounded py-0.5 pr-1 text-xs ${selected ? 'bg-accent-500/20 text-ink-100' : 'text-ink-300 hover:bg-ink-800'}`}
        style={{ paddingLeft: 4 + depth * 12 }}
      >
        {kids.length ? (
          <button className="w-3 text-ink-400" onClick={() => setOpen(!open)} aria-label={open ? 'Recolher' : 'Expandir'}>{open ? '▾' : '▸'}</button>
        ) : (
          <span className="w-3" />
        )}
        <span className="w-4 text-center text-ink-400">{ICONS[el.type]}</span>
        {renaming ? (
          <input
            className="input py-0 text-xs"
            autoFocus
            defaultValue={el.name}
            onBlur={(e) => {
              const name = e.target.value.trim() || el.name;
              applyScreen((s) => ops.updateElements(s, [el.id], () => ({ name })));
              setRenaming(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <button
            className={`min-w-0 flex-1 truncate py-0.5 text-left ${!el.visible ? 'opacity-40' : ''}`}
            onClick={(e) => {
              const cur = useWebDesign.getState().selection;
              select(e.shiftKey || e.metaKey || e.ctrlKey ? (cur.includes(el.id) ? cur.filter((i) => i !== el.id) : [...cur, el.id]) : [el.id]);
            }}
            onDoubleClick={() => setRenaming(true)}
          >
            {el.name}
            {el.initiallyHidden && <span className="ml-1 text-amber-400" title="Oculto ao iniciar o protótipo">◌</span>}
          </button>
        )}
        <button
          className={`w-4 ${el.locked ? 'text-amber-400' : 'text-ink-400 opacity-0 group-hover:opacity-100'}`}
          title={el.locked ? 'Desbloquear' : 'Bloquear'}
          onClick={() => applyScreen((s) => ops.updateElements(s, [el.id], (e) => ({ locked: !e.locked })))}
        >
          {el.locked ? '🔒' : '🔓'}
        </button>
        <button
          className={`w-4 ${!el.visible ? 'text-ink-100' : 'text-ink-400 opacity-0 group-hover:opacity-100'}`}
          title={el.visible ? 'Ocultar' : 'Mostrar'}
          onClick={() => applyScreen((s) => ops.updateElements(s, [el.id], (e) => ({ visible: !e.visible })))}
        >
          {el.visible ? '👁' : '—'}
        </button>
      </li>
      {open && [...kids].reverse().map((k) => <LayerRow key={k.id} el={k} depth={depth + 1} screen={screen} />)}
    </>
  );
}

function LayersSection() {
  const screen = useWebDesign(selectScreen);
  const roots = ops.childrenOf(screen, null);
  return (
    <section className="flex min-h-0 flex-1 flex-col p-3">
      <div className="section-title mb-2">Camadas</div>
      {roots.length === 0 && <p className="text-xs text-ink-400">Nenhum elemento. Use "Inserir" acima.</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {[...roots].reverse().map((el) => <LayerRow key={el.id} el={el} depth={0} screen={screen} />)}
      </ul>
    </section>
  );
}

export function LeftPanel() {
  return (
    <div className="flex h-full flex-col">
      <ScreensSection />
      <ComponentsSection />
      <InsertSection />
      <LayersSection />
    </div>
  );
}

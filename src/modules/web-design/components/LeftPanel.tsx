import { useState } from 'react';
import { createElement, ELEMENT_LABELS, INSERTABLE, type ElementType, type WDElement, type WDScreen } from '../model';
import * as ops from '../ops';
import { selectDoc, selectScreen, useWebDesign } from '../store';
import { useView } from '../viewStore';

const ICONS: Record<ElementType, string> = {
  frame: '▭', ellipse: '◯', text: 'T', button: '⬭', image: '🖼', icon: '★', input: '⌨', card: '▤', navbar: '☰', menu: '≡', modal: '⧉', group: '⊞',
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
      <InsertSection />
      <LayersSection />
    </div>
  );
}

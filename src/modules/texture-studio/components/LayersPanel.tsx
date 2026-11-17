import { useState } from 'react';
import { createId } from '@/core/utils/id';
import { MASK_LABELS } from '../engine/types';
import { LAYER_TEMPLATES, selectDoc, useTextures } from '../store';

/** Layer stack: top of the list = top layer. Add from templates, reorder, hide, duplicate, delete. */
export function LayersPanel() {
  const doc = useTextures(selectDoc);
  const selected = useTextures((s) => s.selected);
  const [adding, setAdding] = useState(false);
  const st = useTextures.getState;
  const move = (id: string, dir: 1 | -1) =>
    st().apply((d) => {
      const i = d.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (j < 0 || j >= d.layers.length) return d;
      const layers = [...d.layers];
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...d, layers };
    });
  const rows = [...doc.layers].reverse();
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-ink-800 p-2">
        <div className="section-title">Camadas ({doc.layers.length})</div>
        <div className="relative ml-auto">
          <button className="btn-primary px-2 py-1 text-xs" onClick={() => setAdding((v) => !v)} data-testid="add-layer">+ Camada</button>
          {adding && (
            <div className="panel absolute right-0 z-20 mt-1 w-52 p-1 shadow-xl" role="menu">
              {LAYER_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  role="menuitem"
                  className="block w-full rounded px-2 py-1.5 text-left text-xs text-ink-200 hover:bg-ink-800"
                  onClick={() => {
                    st().addLayer(t.make());
                    setAdding(false);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1" data-testid="layers">
        {rows.map((l) => {
          const sel = l.id === selected;
          return (
            <li key={l.id} className={`group mb-1 flex items-center gap-1 rounded-md border px-1.5 py-1 ${sel ? 'border-accent-500 bg-accent-500/10' : 'border-transparent hover:bg-ink-800'}`}>
              <button
                className={`w-5 text-xs ${l.visible ? 'text-ink-200' : 'text-ink-600'}`}
                aria-label={`${l.visible ? 'Ocultar' : 'Mostrar'} ${l.name}`}
                onClick={() => st().updateLayer(l.id, (x) => ({ ...x, visible: !x.visible }))}
              >
                {l.visible ? '◉' : '○'}
              </button>
              <span className="h-5 w-5 shrink-0 rounded border border-ink-700" style={{ background: l.content.colors.length > 1 ? `linear-gradient(90deg, ${l.content.colors.join(',')})` : l.content.colors[0] }} />
              <button className="min-w-0 flex-1 text-left" onClick={() => st().set({ selected: l.id })} aria-label={`Selecionar camada ${l.name}`}>
                <div className={`truncate text-xs ${l.visible ? 'text-ink-100' : 'text-ink-500'}`}>{l.name}</div>
                <div className="truncate text-[10px] text-ink-400">
                  {l.content.pattern ? l.content.pattern.gen : 'cor'} · {MASK_LABELS[l.mask.kind].split(' (')[0]} · {Math.round(l.opacity * 100)}%
                </div>
              </button>
              <div className="flex opacity-60 group-hover:opacity-100">
                <button className="px-1 text-xs text-ink-300" aria-label={`Subir ${l.name}`} onClick={() => move(l.id, 1)}>▲</button>
                <button className="px-1 text-xs text-ink-300" aria-label={`Descer ${l.name}`} onClick={() => move(l.id, -1)}>▼</button>
                <button
                  className="px-1 text-xs text-ink-300"
                  aria-label={`Duplicar ${l.name}`}
                  onClick={() => st().addLayer({ ...structuredClone(l), id: createId('lyr'), name: `${l.name} (cópia)` })}
                >
                  ⧉
                </button>
                <button
                  className="px-1 text-xs text-red-300"
                  aria-label={`Excluir ${l.name}`}
                  disabled={doc.layers.length <= 1}
                  onClick={() => st().apply((d) => ({ ...d, layers: d.layers.filter((x) => x.id !== l.id) }))}
                >
                  ✕
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

import { Eye, EyeOff, Focus, Layers, RotateCcw } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { partVisible, useArsenal } from '../store';
import { Btn, FOCUS, Section, Slider, useProfile } from './ui';

/**
 * Modular inspector: every sub-mesh of the weapon (slide, barrel, magazine, trigger, rail…)
 * can be hidden, isolated (solo) or selected; the explode slider pulls the parts apart for
 * disassembly / animation previews.
 */
export function PartsInspector() {
  const p = useProfile();
  const { parts, hidden, solo, selected, explode } = useArsenal(useShallow((s) => ({ parts: s.parts, hidden: s.hidden, solo: s.solo, selected: s.selected, explode: s.explode })));
  const st = useArsenal.getState;
  const iconSize = p === 'tv' ? 22 : 16;
  return (
    <Section
      title={`Sub-malhas (${parts.length})`}
      icon={<Layers size={16} />}
      right={
        <Btn variant="ghost" onClick={() => st().set({ hidden: {}, solo: null, explode: 0 })} aria-label="Mostrar todas as peças">
          <RotateCcw size={iconSize - 2} /> Todas
        </Btn>
      }
    >
      <Slider label="Vista explodida (desmontagem)" value={explode} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => st().set({ explode: v })} />
      <ul className="space-y-1" data-testid="arsenal-parts">
        {parts.map((part) => {
          const visible = partVisible({ hidden, solo }, part.key);
          const isSel = selected === part.key;
          return (
            <li key={part.key} className={`flex items-center gap-1 rounded-lg ${isSel ? 'bg-cyan-400/10 ring-1 ring-cyan-400/50' : ''}`}>
              <button
                type="button"
                onClick={() => st().set({ selected: isSel ? null : part.key })}
                className={`min-w-0 flex-1 truncate rounded-lg px-2 text-left ${p === 'tv' ? 'min-h-14 text-lg' : p === 'mobile' ? 'min-h-12 text-sm' : 'min-h-8 text-xs'} ${visible ? 'text-zinc-100' : 'text-zinc-500 line-through'} ${FOCUS}`}
                aria-label={`Selecionar ${part.name}`}
              >
                {part.name}
              </button>
              <button
                type="button"
                onClick={() => st().toggleHidden(part.key)}
                aria-label={`${hidden[part.key] ? 'Mostrar' : 'Ocultar'} ${part.name}`}
                aria-pressed={!hidden[part.key]}
                className={`rounded-lg p-2 ${hidden[part.key] ? 'text-zinc-500' : 'text-zinc-200'} hover:bg-white/10 ${FOCUS}`}
              >
                {hidden[part.key] ? <EyeOff size={iconSize} /> : <Eye size={iconSize} />}
              </button>
              <button
                type="button"
                onClick={() => st().set({ solo: solo === part.key ? null : part.key })}
                aria-label={`Isolar ${part.name}`}
                aria-pressed={solo === part.key}
                className={`rounded-lg p-2 ${solo === part.key ? 'bg-cyan-400/20 text-cyan-200' : 'text-zinc-400'} hover:bg-white/10 ${FOCUS}`}
              >
                <Focus size={iconSize} />
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { queryAssets } from '@/core/assets/assetService';
import { ensureAssetFont } from '@/core/assets/assetUrls';
import { safeColor } from '@/core/utils/sanitize';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { Modal } from '@/ui/Modal';
import { toast } from '@/ui/toast';
import { clearOverrides, createBreakpoint, normalizeBreakpoint } from '../breakpoints';
import { fontAssetId, fontFamilyForAsset } from '../fonts';
import { iconLabel, iconSvg, useIcons } from '../icons';
import { TRANSITIONS, type Breakpoint, type HoverStyle, type Interaction, type Transition, type WDElement } from '../model';
import * as ops from '../ops';
import { selectDoc, selectEditingBreakpoint, useWebDesign } from '../store';
import { ColorField, NumField, Section, TextField } from './fields';

const st = () => useWebDesign.getState();
const patchSel = (fn: (e: WDElement) => Partial<WDElement>) => st().applyScreen((s) => ops.updateElements(s, st().selection, fn));
const liveSel = (fn: (e: WDElement) => Partial<WDElement>) => st().live((s) => ops.updateElements(s, st().selection, fn));
const end = () => st().endGesture();

// ---------------- states ----------------

const STATE_TABS = [
  { id: 'hover', label: 'Hover' },
  { id: 'pressed', label: 'Pressionado' },
  { id: 'focus', label: 'Foco' },
] as const;

export function StatesSection({ el }: { el: WDElement }) {
  const [tab, setTab] = useState<(typeof STATE_TABS)[number]['id']>('hover');
  const s = el.style;
  const cur = el[tab];
  const setState = (v: HoverStyle | null) => patchSel(() => ({ [tab]: v }) as Partial<WDElement>);
  return (
    <Section title="Estados">
      <div className="grid grid-cols-3 gap-1">
        {STATE_TABS.map((t) => (
          <button key={t.id} className="icon-btn h-7 w-full text-[11px]" data-active={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
            {el[t.id] ? ' •' : ''}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" aria-label={`Ativar estado ${tab}`} checked={!!cur} onChange={(e) => setState(e.target.checked ? { fill: s.fill, textColor: s.textColor, borderColor: s.borderColor } : null)} />
        Definir estilo deste estado
      </label>
      {cur && (
        <>
          <ColorField label="Preench." value={cur.fill ?? s.fill} onLive={(fill) => liveSel((x) => ({ [tab]: { ...x[tab], fill } }))} onEnd={end} onCommit={(fill) => patchSel((x) => ({ [tab]: { ...x[tab], fill: safeColor(fill, s.fill) } }))} />
          <ColorField label="Texto" value={cur.textColor ?? s.textColor} onLive={(textColor) => liveSel((x) => ({ [tab]: { ...x[tab], textColor } }))} onEnd={end} onCommit={(textColor) => patchSel((x) => ({ [tab]: { ...x[tab], textColor: safeColor(textColor, s.textColor) } }))} />
          <ColorField label="Borda" value={cur.borderColor ?? s.borderColor} onLive={(borderColor) => liveSel((x) => ({ [tab]: { ...x[tab], borderColor } }))} onEnd={end} onCommit={(borderColor) => patchSel((x) => ({ [tab]: { ...x[tab], borderColor: safeColor(borderColor, s.borderColor) } }))} />
          {tab !== 'hover' && s.borderWidth === 0 && <p className="text-[11px] text-ink-400">A cor da borda só aparece com espessura de borda maior que zero.</p>}
        </>
      )}
      <label className="flex items-center gap-2 border-t border-ink-800 pt-2 text-xs">
        <input type="checkbox" checked={el.disabled} onChange={(e) => patchSel(() => ({ disabled: e.target.checked }))} /> Desabilitado (sem interações, opacidade reduzida)
      </label>
    </Section>
  );
}

// ---------------- fonts ----------------

const BUILTIN_FONTS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter / Sans' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Serif' },
  { value: "ui-monospace, 'SFMono-Regular', monospace", label: 'Monospace' },
  { value: "'Trebuchet MS', Helvetica, sans-serif", label: 'Humanista' },
];

export function FontSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const projectId = useWebDesign((s) => s.projectId);
  const fonts = useLiveQuery(() => queryAssets({ kind: 'font', sort: 'name' }), []);
  const [picking, setPicking] = useState(false);
  const known = BUILTIN_FONTS.some((f) => f.value === value) || fonts?.some((f) => fontFamilyForAsset(f.id) === value);
  const missingLib = fontAssetId(value) && fonts && !fonts.some((f) => fontFamilyForAsset(f.id) === value);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <select className="input py-1 text-xs" aria-label="Fonte" value={value} onChange={(e) => onChange(e.target.value)}>
          {BUILTIN_FONTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          {fonts && fonts.length > 0 && (
            <optgroup label="Biblioteca">
              {fonts.map((f) => <option key={f.id} value={fontFamilyForAsset(f.id)}>{f.name}</option>)}
            </optgroup>
          )}
          {!known && <option value={value}>{missingLib ? 'Fonte ausente na biblioteca' : value}</option>}
        </select>
        <button className="btn-ghost shrink-0 px-2 text-xs" title="Importar ou escolher uma fonte da biblioteca" onClick={() => setPicking(true)}>Aa…</button>
      </div>
      {picking && (
        <AssetPicker
          kinds={['font']}
          projectId={projectId}
          title="Fonte da biblioteca"
          onClose={() => setPicking(false)}
          onPick={(a) => {
            void ensureAssetFont(a.id);
            onChange(fontFamilyForAsset(a.id));
          }}
        />
      )}
    </div>
  );
}

// ---------------- icons ----------------

function IconPickerDialog({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const icons = useIcons();
  const [q, setQ] = useState('');
  const names = useMemo(() => {
    const all = icons ? Object.keys(icons) : [];
    const term = q.trim().toLowerCase().replace(/\s+/g, '');
    return (term ? all.filter((n) => n.toLowerCase().includes(term)) : all).slice(0, 240);
  }, [icons, q]);
  return (
    <Modal open wide title="Biblioteca de ícones" onClose={onClose}>
      <input className="input mb-3" placeholder="Pesquisar (em inglês: home, user, arrow…)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Pesquisar ícones" />
      {!icons && <p className="py-6 text-center text-sm text-ink-400">Carregando ícones…</p>}
      {icons && (
        <>
          <p className="mb-2 text-xs text-ink-400">{Object.keys(icons).length} ícones (Lucide, licença ISC). Mostrando {names.length}.</p>
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-10">
            {names.map((n) => (
              <button
                key={n}
                title={iconLabel(n)}
                aria-label={iconLabel(n)}
                className="flex aspect-square items-center justify-center rounded p-2 text-ink-100 hover:bg-ink-800"
                onClick={() => {
                  onPick(n);
                  onClose();
                }}
                dangerouslySetInnerHTML={{ __html: iconSvg(n, icons) }}
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

export function IconField({ el }: { el: WDElement }) {
  const [open, setOpen] = useState(false);
  const icons = useIcons(!!el.iconName);
  return (
    <div className="space-y-1">
      <span className="label">Ícone</span>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-ink-700 p-1.5 text-ink-100">
          {el.iconName && icons ? <span className="h-full w-full" dangerouslySetInnerHTML={{ __html: iconSvg(el.iconName, icons) }} /> : <span>{el.text}</span>}
        </span>
        <button className="btn-outline flex-1 text-xs" onClick={() => setOpen(true)}>{el.iconName ? iconLabel(el.iconName) : 'Escolher ícone…'}</button>
        {el.iconName && <button className="btn-ghost text-xs" onClick={() => patchSel(() => ({ iconName: undefined }))}>Glifo</button>}
      </div>
      {!el.iconName && <p className="text-[11px] text-ink-400">Sem ícone da biblioteca, o elemento exibe o caractere do campo "Texto".</p>}
      {open && <IconPickerDialog onClose={() => setOpen(false)} onPick={(iconName) => patchSel(() => ({ iconName }))} />}
    </div>
  );
}

// ---------------- transitions ----------------

export function TransitionFields({ interaction, onChange }: { interaction: Extract<Interaction, { type: 'navigate' | 'toggle' }>; onChange: (i: Interaction) => void }) {
  const t = interaction.transition ?? 'none';
  return (
    <div className="grid grid-cols-[1fr_auto] gap-1.5">
      <select className="input py-1 text-xs" aria-label="Transição" value={t} onChange={(e) => onChange({ ...interaction, transition: e.target.value as Transition })}>
        {TRANSITIONS.map((x) => <option key={x.id} value={x.id}>Transição: {x.label}</option>)}
      </select>
      <div className="w-20">
        <NumField label="ms" title="Duração da transição" value={interaction.duration ?? 300} min={50} max={5000} step={50} onCommit={(duration) => onChange({ ...interaction, duration })} />
      </div>
    </div>
  );
}

// ---------------- components ----------------

export function makeComponentFromSelection() {
  const s = st();
  if (!s.selection.length) return;
  const doc = s.history.present;
  if (s.activeBreakpoint && !ops.isComponent(doc, s.activeScreenId)) {
    toast.info('Volte ao layout base para criar componentes.');
    return;
  }
  const frame = ops.getScreen(doc, s.activeScreenId);
  const ids = new Set(s.selection.flatMap((id) => (frame ? [id, ...ops.descendantIds(frame, id)] : [id])));
  const hasOverrides = frame?.elements.some((e) => ids.has(e.id) && e.overrides && Object.keys(e.overrides).length);
  if (hasOverrides && !confirm('Alguns elementos têm ajustes de breakpoint. Dentro de componentes o layout segue as constraints, então esses ajustes serão descartados. Continuar?')) return;
  const name = prompt('Nome do componente', 'Componente');
  if (name === null) return;
  let instanceId: string | undefined;
  s.apply((d) => {
    const r = ops.createComponentFromSelection(d, s.activeScreenId, s.selection, name.trim() || 'Componente');
    instanceId = r.instanceId;
    return r.doc;
  });
  if (instanceId) {
    s.select([instanceId]);
    toast.success('Componente criado. Edições no mestre se refletem em todas as instâncias.');
  } else toast.error('Selecione elementos do mesmo nível para criar um componente.');
}

export function InstanceSection({ el }: { el: WDElement }) {
  const doc = useWebDesign(selectDoc);
  const comp = doc.components.find((c) => c.id === el.componentId);
  if (!comp) return null;
  const textChildren = comp.elements.filter((c) => ['text', 'button', 'card', 'modal', 'navbar', 'icon'].includes(c.type) && c.text !== undefined);
  return (
    <Section title="Instância de componente">
      <p className="text-xs text-ink-300">◆ {comp.name} <span className="text-ink-400">({comp.width}×{comp.height})</span></p>
      <div className="grid grid-cols-2 gap-1">
        <button className="btn-outline text-xs" onClick={() => st().setActiveScreen(comp.id)}>Editar mestre</button>
        <button
          className="btn-outline text-xs"
          title="Converte esta instância em elementos independentes"
          onClick={() => {
            let ids: string[] = [];
            const s = st();
            s.apply((d) => {
              const r = ops.detachInstance(d, s.activeScreenId, el.id);
              ids = r.ids;
              return r.doc;
            });
            s.select(ids);
          }}
        >
          Desvincular
        </button>
      </div>
      {textChildren.length > 0 && (
        <div className="space-y-1.5 border-t border-ink-800 pt-2">
          <span className="label">Textos desta instância</span>
          {textChildren.map((c) => (
            <div key={c.id} className="flex items-end gap-1">
              <div className="min-w-0 flex-1">
                <TextField
                  label={c.name}
                  value={el.textOverrides?.[c.id] ?? c.text ?? ''}
                  onCommit={(v) => patchSel((x) => ({ textOverrides: { ...(x.textOverrides ?? {}), [c.id]: v } }))}
                />
              </div>
              {el.textOverrides?.[c.id] !== undefined && (
                <button
                  className="btn-ghost px-1.5 text-xs"
                  title="Voltar ao texto do mestre"
                  onClick={() =>
                    patchSel((x) => {
                      const o = { ...(x.textOverrides ?? {}) };
                      delete o[c.id];
                      return { textOverrides: o };
                    })
                  }
                >
                  ↺
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ---------------- breakpoints ----------------

export function BreakpointOverrideInfo({ el }: { el: WDElement }) {
  const bp = useWebDesign(selectEditingBreakpoint);
  if (!bp) return null;
  const o = el.overrides?.[bp.id];
  return (
    <Section title={`Ajustes: ${bp.name}`}>
      {o ? (
        <>
          <p className="text-[11px] text-cyan-200">
            Ajustado neste breakpoint: {[o.x !== undefined && 'posição/tamanho', o.visible !== undefined && 'visibilidade', o.fontSize !== undefined && 'fonte'].filter(Boolean).join(', ')}.
          </p>
          <button className="btn-outline w-full text-xs" onClick={() => patchSel((x) => clearOverrides(x, bp.id))}>Limpar ajustes deste breakpoint</button>
        </>
      ) : (
        <p className="text-[11px] text-ink-400">Sem ajustes manuais: o elemento segue as constraints. Mova, redimensione, oculte ou mude a fonte para criar um ajuste.</p>
      )}
    </Section>
  );
}

function BreakpointRow({ bp, onChange, onDelete }: { bp: Breakpoint; onChange: (b: Breakpoint) => void; onDelete: () => void }) {
  return (
    <div className="space-y-1.5 rounded border border-ink-800 p-2">
      <div className="flex gap-1">
        <input className="input py-1 text-xs" aria-label="Nome do breakpoint" defaultValue={bp.name} onBlur={(e) => e.target.value.trim() && e.target.value !== bp.name && onChange({ ...bp, name: e.target.value.trim() })} />
        <button className="btn-ghost px-2 text-xs" title="Excluir breakpoint e seus ajustes" onClick={onDelete}>✕</button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <select className="input py-1 text-xs" aria-label="Tipo" value={bp.mode} onChange={(e) => onChange(normalizeBreakpoint({ ...bp, mode: e.target.value as Breakpoint['mode'] }))}>
          <option value="max">Até (max-width)</option>
          <option value="min">A partir de (min-width)</option>
        </select>
        <NumField label="px" title="Largura do breakpoint" value={bp.width} min={100} max={10000} onCommit={(width) => onChange(normalizeBreakpoint({ ...bp, width }))} />
      </div>
      <NumField label="Pv" title="Largura usada para editar e pré-visualizar" value={bp.previewWidth} min={100} max={10000} onCommit={(previewWidth) => onChange(normalizeBreakpoint({ ...bp, previewWidth }))} />
    </div>
  );
}

export function BreakpointsSection() {
  const doc = useWebDesign(selectDoc);
  const update = (fn: (bps: Breakpoint[]) => Breakpoint[]) => st().apply((d) => ({ ...d, breakpoints: fn(d.breakpoints) }));
  return (
    <Section
      title="Breakpoints"
      right={
        <button className="icon-btn h-6 w-6" title="Novo breakpoint" aria-label="Novo breakpoint" onClick={() => update((b) => [...b, createBreakpoint()])}>
          +
        </button>
      }
    >
      <p className="text-[11px] leading-relaxed text-ink-400">Escolha um breakpoint na barra superior para ajustar o layout manualmente nessa faixa de largura. Sem ajustes, os elementos seguem as constraints.</p>
      {doc.breakpoints.map((bp) => (
        <BreakpointRow
          key={bp.id}
          bp={bp}
          onChange={(b) => update((list) => list.map((x) => (x.id === b.id ? b : x)))}
          onDelete={() => {
            if (!confirm(`Excluir o breakpoint "${bp.name}" e todos os ajustes feitos nele?`)) return;
            const s = st();
            if (s.activeBreakpoint === bp.id) s.setActiveBreakpoint(null);
            s.apply((d) => {
              const strip = (f: typeof d.screens[number]) => ({ ...f, elements: f.elements.map((e) => ({ ...e, ...clearOverrides(e, bp.id) })) });
              return { ...d, breakpoints: d.breakpoints.filter((x) => x.id !== bp.id), screens: d.screens.map(strip) };
            });
          }}
        />
      ))}
    </Section>
  );
}

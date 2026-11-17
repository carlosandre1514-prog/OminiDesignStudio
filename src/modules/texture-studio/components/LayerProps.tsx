import { useState } from 'react';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { GENERATORS, GEN_BY_ID, defaultGenParams } from '../engine/generators';
import { BRUSH_SHAPES, type BrushShape } from '../engine/paint3d';
import { paintCanvas, PAINT_RES, syncPaintSource } from '../engine/runner';
import { BLEND_LABELS, HEIGHT_LABELS, MASK_LABELS, pattern, type BlendMode, type HeightMode, type Layer, type LayerContent, type LayerMask, type MaskKind, type PatternRef, type TextMask } from '../engine/types';
import { selectDoc, useTextures } from '../store';
import { Check, Group, Num, Select } from './controls';

const GEN_OPTIONS = (['Ruídos', 'Superfícies', 'Desgaste', 'Geométricos', 'Industriais', 'Orgânicos'] as const).map((group) => ({
  group,
  items: GENERATORS.filter((g) => g.group === group).map((g) => [g.id, g.label] as [string, string]),
}));

/** Generator picker + its parameters + levels/invert. `live` = slider changes (undo step on release). */
function PatternEditor({ value, onChange, allowNone }: { value: PatternRef | null; onChange: (p: PatternRef | null, live?: boolean) => void; allowNone?: boolean }) {
  const gen = value ? GEN_BY_ID.get(value.gen) : null;
  return (
    <div className="space-y-2">
      <Select
        label="Padrão"
        value={value?.gen ?? 'none'}
        options={[...(allowNone ? [{ group: 'Uniforme', items: [['none', 'Nenhum (uniforme)']] as [string, string][] }] : []), ...GEN_OPTIONS]}
        onChange={(id) => onChange(id === 'none' ? null : pattern(id, defaultGenParams(id)))}
      />
      {value && gen && (
        <div className="space-y-1.5 rounded-md border border-ink-800 p-2">
          {gen.nums.map((n) => (
            <Num key={n.key} label={n.label} value={Number(value.params[n.key] ?? n.value)} min={n.min} max={n.max} step={n.step} onLive={(v) => onChange({ ...value, params: { ...value.params, [n.key]: v } }, true)} />
          ))}
          {(gen.choices ?? []).map((c) => (
            <Select key={c.key} label={c.label} value={String(value.params[c.key] ?? c.value)} options={c.options} onChange={(v) => onChange({ ...value, params: { ...value.params, [c.key]: v } })} />
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Num label="Nível mín." value={value.low} min={0} max={1} step={0.01} onLive={(v) => onChange({ ...value, low: Math.min(v, value.high - 0.01) }, true)} />
            <Num label="Nível máx." value={value.high} min={0} max={1} step={0.01} onLive={(v) => onChange({ ...value, high: Math.max(v, value.low + 0.01) }, true)} />
          </div>
          <Check label="Inverter" checked={value.invert} onChange={(v) => onChange({ ...value, invert: v })} />
        </div>
      )}
    </div>
  );
}

function BrushTools({ layer }: { layer: Layer }) {
  const brush = useTextures((s) => s.brush);
  const painting = useTextures((s) => s.painting);
  const st = useTextures.getState;
  const setBrush = (p: Partial<typeof brush>) => st().set({ brush: { ...st().brush, ...p } });
  const fill = (white: boolean) => {
    const { canvas } = paintCanvas(layer);
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, PAINT_RES, PAINT_RES);
    if (white) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, PAINT_RES, PAINT_RES);
    }
    const url = canvas.toDataURL('image/png');
    syncPaintSource(layer.id, url);
    st().updateLayer(layer.id, (l) => ({ ...l, mask: { ...l.mask, paint: url } }));
  };
  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2">
      <div className="flex flex-wrap gap-1">
        <button className={`rounded px-2 py-1 text-[11px] ${painting && !brush.erase ? 'bg-amber-500 text-black' : 'bg-ink-800 text-ink-200'}`} onClick={() => st().set({ painting: true, brush: { ...brush, erase: false } })}>
          Pincel
        </button>
        <button className={`rounded px-2 py-1 text-[11px] ${painting && brush.erase ? 'bg-amber-500 text-black' : 'bg-ink-800 text-ink-200'}`} onClick={() => st().set({ painting: true, brush: { ...brush, erase: true } })}>
          Borracha
        </button>
        <button className={`rounded px-2 py-1 text-[11px] ${!painting ? 'bg-ink-600 text-white' : 'bg-ink-800 text-ink-200'}`} onClick={() => st().set({ painting: !painting })}>
          {painting ? 'Pausar (girar câmera)' : 'Retomar pintura'}
        </button>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Formato do pincel">
        {(Object.keys(BRUSH_SHAPES) as BrushShape[]).map((k) => (
          <button key={k} className={`rounded px-2 py-1 text-[11px] ${brush.shape === k ? 'bg-amber-500 text-black' : 'bg-ink-800 text-ink-200'}`} onClick={() => setBrush({ shape: k })}>
            {BRUSH_SHAPES[k]}
          </button>
        ))}
      </div>
      <label className="flex items-center justify-between gap-2 text-[11px] text-ink-300">
        Cor da tinta
        <input
          type="color"
          aria-label="Cor da tinta"
          className="h-6 w-12 cursor-pointer rounded border border-ink-700 bg-transparent"
          value={layer.content.colors[0] ?? '#c0392b'}
          onChange={(e) => st().updateLayer(layer.id, (l) => ({ ...l, content: { ...l.content, colors: [e.target.value], pattern: null } }))}
        />
      </label>
      <Num label="Tamanho" value={brush.size} min={0.005} max={0.4} step={0.005} format={(v) => `${Math.round(v * 100)}%`} onLive={(v) => setBrush({ size: v })} />
      <Num label="Dureza" value={brush.hardness} min={0} max={1} step={0.05} onLive={(v) => setBrush({ hardness: v })} />
      <Num label="Opacidade do pincel" value={brush.opacity} min={0.05} max={1} step={0.05} onLive={(v) => setBrush({ opacity: v })} />
      <Num label="Fluxo (acúmulo por toque)" value={brush.flow} min={0.05} max={1} step={0.05} onLive={(v) => setBrush({ flow: v })} />
      <Num label="Espaçamento" value={brush.spacing} min={0.05} max={1.5} step={0.05} onLive={(v) => setBrush({ spacing: v })} />
      <div className="flex gap-1">
        <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => fill(true)}>Preencher tudo</button>
        <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => fill(false)}>Limpar</button>
      </div>
      <p className="text-[10px] text-ink-400">Pinte na vista 3D (no modelo) ou na vista 2D. A pintura repete sem emendas.</p>
    </div>
  );
}

function TextEditor({ text, onChange }: { text: TextMask; onChange: (t: TextMask, live?: boolean) => void }) {
  return (
    <div className="space-y-2 rounded-md border border-ink-800 p-2">
      <label className="block text-[11px] text-ink-300">
        Texto (Enter = nova linha)
        <textarea className="input mt-0.5 font-mono text-xs" rows={2} value={text.text} onChange={(e) => onChange({ ...text, text: e.target.value })} aria-label="Texto do decalque" />
      </label>
      <Select label="Fonte" value={text.font} options={[['Arial', 'Arial'], ['Impact', 'Impact (militar)'], ['Courier New', 'Courier (serial)'], ['Georgia', 'Georgia (serifa)'], ['Verdana', 'Verdana'], ['monospace', 'Monoespaçada']]} onChange={(v) => onChange({ ...text, font: v })} />
      <Num label="Tamanho" value={text.size} min={0.01} max={0.5} step={0.005} onLive={(v) => onChange({ ...text, size: v }, true)} />
      <div className="grid grid-cols-2 gap-2">
        <Num label="Posição X" value={text.x} min={0} max={1} step={0.01} onLive={(v) => onChange({ ...text, x: v }, true)} />
        <Num label="Posição Y" value={text.y} min={0} max={1} step={0.01} onLive={(v) => onChange({ ...text, y: v }, true)} />
      </div>
      <Num label="Rotação" value={text.rotation} min={-180} max={180} step={1} format={(v) => `${v}°`} onLive={(v) => onChange({ ...text, rotation: v }, true)} />
      <Num label="Repetições (grade)" value={text.repeat} min={1} max={12} step={1} onLive={(v) => onChange({ ...text, repeat: v }, true)} />
      <Check label="Negrito" checked={text.bold} onChange={(v) => onChange({ ...text, bold: v })} />
    </div>
  );
}

/** Properties of the selected layer: general, channels, content and mask. */
export function LayerProps() {
  const doc = useTextures(selectDoc);
  const projectId = useTextures((s) => s.projectId);
  const selected = useTextures((s) => s.selected);
  const [picking, setPicking] = useState<null | 'content' | 'mask'>(null);
  const layer = doc.layers.find((l) => l.id === selected);
  const st = useTextures.getState;
  if (!layer) return <div className="p-4 text-sm text-ink-400">Selecione uma camada.</div>;
  const up = (fn: (l: Layer) => Layer, live = false) => st().updateLayer(layer.id, fn, live);
  const content = (p: Partial<LayerContent>, live = false) => up((l) => ({ ...l, content: { ...l.content, ...p } }), live);
  const mask = (p: Partial<LayerMask>, live = false) => up((l) => ({ ...l, mask: { ...l.mask, ...p } }), live);
  const c = layer.content;
  const m = layer.mask;

  return (
    <div data-testid="layer-props">
      <Group title="Camada">
        <input className="input py-1 text-xs" value={layer.name} aria-label="Nome da camada" onChange={(e) => up((l) => ({ ...l, name: e.target.value }), true)} onBlur={() => st().endGesture()} />
        <Num label="Opacidade" value={layer.opacity} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onLive={(v) => up((l) => ({ ...l, opacity: v }), true)} />
        <div className="grid grid-cols-2 gap-2">
          <Select<BlendMode> label="Mesclagem (cor)" value={layer.blend} options={Object.entries(BLEND_LABELS) as [BlendMode, string][]} onChange={(v) => up((l) => ({ ...l, blend: v }))} />
          <Select<HeightMode> label="Altura" value={layer.heightMode} options={Object.entries(HEIGHT_LABELS) as [HeightMode, string][]} onChange={(v) => up((l) => ({ ...l, heightMode: v }))} />
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(
            [
              ['color', 'Cor'],
              ['height', 'Altura'],
              ['roughness', 'Rugosidade'],
              ['metal', 'Metálico'],
              ['emissive', 'Emissivo'],
            ] as const
          ).map(([k, label]) => (
            <Check key={k} label={label} checked={layer.channels[k]} onChange={(v) => up((l) => ({ ...l, channels: { ...l.channels, [k]: v } }))} />
          ))}
        </div>
      </Group>

      <Group title="Conteúdo">
        <PatternEditor allowNone value={c.pattern} onChange={(p, live) => content({ pattern: p }, live)} />
        <div>
          <div className="mb-1 flex items-center text-[11px] text-ink-300">
            Cores {c.colors.length > 1 ? '(gradiente pelo padrão)' : ''}
            <button className="ml-auto text-accent-400" onClick={() => content({ colors: [...c.colors, c.colors[c.colors.length - 1]] })} disabled={c.colors.length >= 6}>+ cor</button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {c.colors.map((col, i) => (
              <div key={i} className="flex items-center">
                <input type="color" value={col} aria-label={`Cor ${i + 1}`} className="h-7 w-9 cursor-pointer rounded border border-ink-700 bg-transparent" onChange={(e) => content({ colors: c.colors.map((x, j) => (j === i ? e.target.value : x)) }, true)} onBlur={() => st().endGesture()} />
                {c.colors.length > 1 && (
                  <button className="px-0.5 text-[10px] text-ink-400" aria-label={`Remover cor ${i + 1}`} onClick={() => content({ colors: c.colors.filter((_, j) => j !== i) })}>✕</button>
                )}
              </div>
            ))}
          </div>
          {c.colors.length > 1 && <Check label="Cores em faixas (camuflagem / posterizar)" checked={c.stepped} onChange={(v) => content({ stepped: v })} />}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink-300">
          <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setPicking('content')}>{c.imageId ? 'Trocar imagem' : 'Usar imagem como cor…'}</button>
          {c.imageId && <button className="text-red-300" onClick={() => content({ imageId: undefined })}>remover imagem</button>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Num label="Rugosidade A" value={c.roughA} min={0} max={1} step={0.01} onLive={(v) => content({ roughA: v }, true)} />
          <Num label="Rugosidade B" value={c.roughB} min={0} max={1} step={0.01} onLive={(v) => content({ roughB: v }, true)} />
          <Num label="Metálico A" value={c.metalA} min={0} max={1} step={0.01} onLive={(v) => content({ metalA: v }, true)} />
          <Num label="Metálico B" value={c.metalB} min={0} max={1} step={0.01} onLive={(v) => content({ metalB: v }, true)} />
          <Num label="Relevo (pelo padrão)" value={c.heightAmount} min={-0.4} max={0.4} step={0.005} onLive={(v) => content({ heightAmount: v }, true)} />
          <Num label="Altura base" value={c.heightOffset} min={-0.3} max={0.3} step={0.005} onLive={(v) => content({ heightOffset: v }, true)} />
        </div>
        {layer.channels.emissive && (
          <div className="flex items-end gap-2">
            <input type="color" value={c.emissive} aria-label="Cor emissiva" className="h-8 w-10 rounded border border-ink-700 bg-transparent" onChange={(e) => content({ emissive: e.target.value }, true)} onBlur={() => st().endGesture()} />
            <div className="flex-1">
              <Num label="Intensidade emissiva" value={c.emissiveIntensity} min={0} max={1} step={0.01} onLive={(v) => content({ emissiveIntensity: v }, true)} />
            </div>
          </div>
        )}
        <p className="text-[10px] leading-snug text-ink-400">A e B são os valores nas partes baixas e altas do padrão (sem padrão vale A).</p>
      </Group>

      <Group title="Máscara (onde a camada aparece)">
        <Select<MaskKind>
          label="Tipo"
          value={m.kind}
          options={Object.entries(MASK_LABELS) as [MaskKind, string][]}
          onChange={(k) =>
            mask({
              kind: k,
              ...(k === 'pattern' && !m.pattern ? { pattern: pattern('grunge') } : {}),
              ...(k === 'text' && !m.text ? { text: { text: 'OMNI ARMS', font: 'Impact', size: 0.08, x: 0.5, y: 0.5, rotation: 0, bold: false, repeat: 1 } } : {}),
            })
          }
        />
        {m.kind === 'pattern' && <PatternEditor value={m.pattern} onChange={(p, live) => mask({ pattern: p }, live)} />}
        {m.kind === 'paint' && <BrushTools layer={layer} />}
        {m.kind === 'text' && m.text && <TextEditor text={m.text} onChange={(t, live) => mask({ text: t }, live)} />}
        {m.kind === 'image' && <button className="btn-ghost px-2 py-1 text-[11px]" onClick={() => setPicking('mask')}>{m.imageId ? 'Trocar imagem da máscara' : 'Escolher imagem…'}</button>}
        {(m.kind === 'curvature' || m.kind === 'height') && (
          <>
            <Select
              label="Onde"
              value={m.side}
              options={m.kind === 'curvature' ? [['convex', 'Bordas / quinas (desgaste)'], ['concave', 'Cavidades (sujeira)']] : [['high', 'Partes altas'], ['low', 'Partes baixas']]}
              onChange={(v) => mask({ side: v as LayerMask['side'] })}
            />
            <Num label="Quantidade" value={m.amount} min={0} max={1} step={0.01} onLive={(v) => mask({ amount: v }, true)} />
            {m.kind === 'curvature' && (
              <Check
                label="Quebrar em lascas (desgaste irregular)"
                checked={!!m.pattern}
                onChange={(v) => mask({ pattern: v ? pattern('grunge', { scale: 6, coverage: 0.5, sharpness: 3, seed: 7 }) : null })}
              />
            )}
            <p className="text-[10px] text-ink-400">{doc.previewShape === 'model' && doc.target ? 'Calculada pela geometria real do modelo (quinas e cantos) e pelo relevo das camadas abaixo.' : 'Calculada a partir do relevo das camadas abaixo.'}</p>
          </>
        )}
        {m.kind !== 'none' && <Check label="Inverter máscara" checked={m.invert} onChange={(v) => mask({ invert: v })} />}
      </Group>

      {picking && (
        <AssetPicker
          kinds={['image']}
          projectId={projectId}
          title={picking === 'content' ? 'Imagem de cor (repete)' : 'Imagem da máscara (claro = visível)'}
          onClose={() => setPicking(null)}
          onPick={(a) => {
            if (picking === 'content') content({ imageId: a.id });
            else mask({ imageId: a.id });
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}

export function DocSettings() {
  const doc = useTextures(selectDoc);
  const previewSize = useTextures((s) => s.previewSize);
  const st = useTextures.getState;
  return (
    <Group title="Configurações da textura">
      <Num label="Força da normal" value={doc.normalStrength} min={0} max={4} step={0.05} onLive={(v) => st().live((d) => ({ ...d, normalStrength: v }))} />
      <Num label="Força da oclusão (AO)" value={doc.aoStrength} min={0} max={2} step={0.05} onLive={(v) => st().live((d) => ({ ...d, aoStrength: v }))} />
      {doc.target && doc.previewShape === 'model' ? (
        <Num label="Escala dos padrões no modelo (repetições)" value={doc.modelScale ?? 1} min={1} max={32} step={1} onLive={(v) => st().live((d) => ({ ...d, modelScale: v }))} />
      ) : (
        <Num label="Repetição na prévia" value={doc.previewTiling} min={1} max={8} step={1} onLive={(v) => st().live((d) => ({ ...d, previewTiling: v }))} />
      )}
      <div className="grid grid-cols-2 gap-2">
        <Select label="Normal" value={doc.normalFormat} options={[['opengl', 'OpenGL (Y+)'], ['directx', 'DirectX (Y−)']]} onChange={(v) => st().apply((d) => ({ ...d, normalFormat: v }))} />
        <Select label="Qualidade da prévia" value={String(previewSize)} options={[['256', '256 px (rápida)'], ['512', '512 px'], ['1024', '1024 px (modelo)']]} onChange={(v) => st().set({ previewSize: Number(v) as 256 | 512 | 1024 })} />
      </div>
      <Select
        label="Tipo de superfície"
        value={doc.surface ?? 'standard'}
        options={[['standard', 'Padrão (PBR)'], ['skin', 'Pele (translucidez / SSS)']]}
        onChange={(v) => st().apply((d) => ({ ...d, surface: v }))}
      />
    </Group>
  );
}

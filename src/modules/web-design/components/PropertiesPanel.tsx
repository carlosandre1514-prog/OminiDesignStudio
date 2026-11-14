import { useShallow } from 'zustand/react/shallow';
import { useState } from 'react';
import { assetUri, parseAssetUri } from '@/core/assets/types';
import { AssetPicker } from '@/modules/asset-library/AssetPicker';
import { importWithFeedback } from '@/modules/asset-library/AssetLibrary';
import { safeColor } from '@/core/utils/sanitize';
import { useSettings } from '@/core/settings/settings';
import { toast } from '@/ui/toast';
import { DEVICE_PRESETS } from '../layout';
import type { ConstraintH, ConstraintV, Interaction, WDElement, WDStyle } from '../model';
import { ELEMENT_LABELS } from '../model';
import * as ops from '../ops';
import { selectDoc, selectScreen, selectSelected, useWebDesign } from '../store';
import { ColorField, NumField, Section, TextField } from './fields';

const st = () => useWebDesign.getState();

function patchSel(fn: (e: WDElement) => Partial<WDElement>) {
  const { selection, applyScreen } = st();
  applyScreen((s) => ops.updateElements(s, selection, fn));
}
function liveSel(fn: (e: WDElement) => Partial<WDElement>) {
  const { selection, live } = st();
  live((s) => ops.updateElements(s, selection, fn));
}
const styleCommit = (p: Partial<WDStyle>) => patchSel(() => ({ style: p as WDStyle }));
const styleLive = (p: Partial<WDStyle>) => liveSel(() => ({ style: p as WDStyle }));
const end = () => st().endGesture();

function ScreenProps() {
  const screen = useWebDesign(selectScreen);
  const grid = useWebDesign((s) => selectDoc(s).grid);
  const set = (p: Partial<typeof screen>) => st().applyScreen((s) => ({ ...s, ...p }));
  const setGrid = (p: Partial<typeof grid>) => st().apply((d) => ({ ...d, grid: { ...d.grid, ...p } }));
  return (
    <>
      <Section title="Tela">
        <TextField label="Nome" value={screen.name} onCommit={(name) => set({ name: name || screen.name })} />
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="L" title="Largura" value={screen.width} min={50} max={10000} onCommit={(width) => set({ width })} />
          <NumField label="A" title="Altura" value={screen.height} min={50} max={20000} onCommit={(height) => set({ height })} />
        </div>
        <select
          className="input py-1 text-xs"
          value=""
          aria-label="Predefinição de dispositivo"
          onChange={(e) => {
            const p = DEVICE_PRESETS.find((d) => d.id === e.target.value);
            if (p) set({ width: p.width, height: p.height });
          }}
        >
          <option value="">Predefinição de tamanho…</option>
          {DEVICE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.width}×{p.height})</option>)}
        </select>
        <ColorField label="Fundo" value={screen.background} onLive={(background) => st().live((s) => ({ ...s, background }))} onEnd={end} onCommit={(background) => set({ background: safeColor(background, screen.background) })} />
        {(screen.guides.x.length > 0 || screen.guides.y.length > 0) && (
          <button className="btn-ghost w-full text-xs" onClick={() => set({ guides: { x: [], y: [] } })}>Remover guias ({screen.guides.x.length + screen.guides.y.length})</button>
        )}
      </Section>
      <Section title="Grid">
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="px" title="Tamanho do grid" value={grid.size} min={1} max={256} onCommit={(size) => setGrid({ size })} />
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.show} onChange={(e) => setGrid({ show: e.target.checked })} /> Mostrar grid</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={grid.snap} onChange={(e) => setGrid({ snap: e.target.checked })} /> Ajustar ao grid</label>
        <p className="text-[11px] leading-relaxed text-ink-400">Arraste das réguas para criar guias. Segure Alt para mover sem ajuste, Shift para travar o eixo.</p>
      </Section>
    </>
  );
}

function ArrangeSection({ multi }: { multi: boolean }) {
  const sel = useWebDesign((s) => s.selection);
  const align = (m: ops.AlignMode) => st().applyScreen((s) => ops.alignElements(s, sel, m));
  const btn = (label: string, title: string, fn: () => void, disabled = false) => (
    <button className="icon-btn h-7 w-full text-xs" title={title} aria-label={title} onClick={fn} disabled={disabled}>{label}</button>
  );
  return (
    <Section title={multi ? `Alinhar (${sel.length})` : 'Organizar'}>
      <div className="grid grid-cols-6 gap-1">
        {btn('⇤', 'Alinhar à esquerda', () => align('left'))}
        {btn('↔', 'Centralizar horizontalmente', () => align('hcenter'))}
        {btn('⇥', 'Alinhar à direita', () => align('right'))}
        {btn('⤒', 'Alinhar ao topo', () => align('top'))}
        {btn('↕', 'Centralizar verticalmente', () => align('vcenter'))}
        {btn('⤓', 'Alinhar à base', () => align('bottom'))}
      </div>
      {multi ? (
        <div className="grid grid-cols-2 gap-1">
          {btn('Distribuir ↔', 'Distribuir horizontalmente (3+)', () => st().applyScreen((s) => ops.distributeElements(s, sel, 'h')), sel.length < 3)}
          {btn('Distribuir ↕', 'Distribuir verticalmente (3+)', () => st().applyScreen((s) => ops.distributeElements(s, sel, 'v')), sel.length < 3)}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-1">
          {btn('⇈', 'Trazer para frente', () => st().applyScreen((s) => ops.reorderElement(s, sel[0], 'front')))}
          {btn('↑', 'Avançar', () => st().applyScreen((s) => ops.reorderElement(s, sel[0], 'forward')))}
          {btn('↓', 'Recuar', () => st().applyScreen((s) => ops.reorderElement(s, sel[0], 'backward')))}
          {btn('⇊', 'Enviar para trás', () => st().applyScreen((s) => ops.reorderElement(s, sel[0], 'back')))}
        </div>
      )}
      {!multi && <p className="text-[11px] text-ink-400">Com um elemento, o alinhamento é relativo à tela.</p>}
    </Section>
  );
}

function ElementProps({ el, multi = false }: { el: WDElement; multi?: boolean }) {
  const doc = useWebDesign(selectDoc);
  const screen = useWebDesign(selectScreen);
  const maxImport = useSettings((s) => s.settings.maxImportSizeMB);
  const s = el.style;
  const hasText = ['text', 'button', 'icon', 'card', 'modal', 'navbar', 'input'].includes(el.type);
  const setBox = (p: Partial<ops.Rect>) => st().applyScreen((sc) => ops.resizeElement(sc, el.id, { x: el.x, y: el.y, w: el.w, h: el.h, ...p }));
  const interaction = el.interaction;
  const setInteraction = (i: Interaction | null) => patchSel(() => ({ interaction: i }));
  const toggleTargets = screen.elements.filter((e) => e.type !== 'group');

  const projectId = useWebDesign((x) => x.projectId);
  const [picking, setPicking] = useState(false);
  /** Uploads go to the Asset Library (validated, deduplicated) and the element references them. */
  const uploadImage = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxImport * 1024 * 1024) return toast.error(`Imagem maior que ${maxImport} MB`);
    const [r] = await importWithFeedback([file], { projectId });
    if (!r || r.status === 'error') return;
    if (r.asset.kind !== 'image' && r.asset.kind !== 'vector') return toast.error('O arquivo não é uma imagem');
    // SVGs are always rendered through <img>, never inlined, so scripts inside them cannot run.
    patchSel(() => ({ src: assetUri(r.asset.id) }));
  };
  const assetRef = parseAssetUri(el.src);

  return (
    <>
      {!multi && <Section title={ELEMENT_LABELS[el.type]}>
        <TextField label="Nome" value={el.name} onCommit={(name) => patchSel(() => ({ name: name || el.name }))} />
        <div className="grid grid-cols-2 gap-1.5">
          <NumField label="X" value={el.x} onCommit={(x) => setBox({ x })} />
          <NumField label="Y" value={el.y} onCommit={(y) => setBox({ y })} />
          <NumField label="L" title="Largura" value={el.w} min={1} onCommit={(w) => setBox({ w })} />
          <NumField label="A" title="Altura" value={el.h} min={1} onCommit={(h) => setBox({ h })} />
        </div>
        <div className="flex gap-3 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={el.locked} onChange={(e) => patchSel(() => ({ locked: e.target.checked }))} /> Bloqueado</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={el.visible} onChange={(e) => patchSel(() => ({ visible: e.target.checked }))} /> Visível</label>
        </div>
      </Section>}

      <Section title={multi ? `Responsividade (${useWebDesign.getState().selection.length} elementos)` : 'Responsividade'}>
        <div className="grid grid-cols-2 gap-1.5">
          <label className="block">
            <span className="label">Horizontal</span>
            <select className="input py-1 text-xs" value={el.constraintH} onChange={(e) => patchSel(() => ({ constraintH: e.target.value as ConstraintH }))}>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
              <option value="center">Centro</option>
              <option value="stretch">Esticar</option>
              <option value="scale">Escalar (%)</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Vertical</span>
            <select className="input py-1 text-xs" value={el.constraintV} onChange={(e) => patchSel(() => ({ constraintV: e.target.value as ConstraintV }))}>
              <option value="top">Topo</option>
              <option value="bottom">Base</option>
              <option value="center">Centro</option>
              <option value="stretch">Esticar</option>
              <option value="scale">Escalar (%)</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-ink-400">Define como o elemento se ajusta quando a largura/altura da tela muda (pré-visualização e código exportado).</p>
      </Section>

      {el.type !== 'group' && !multi && (
        <Section title="Conteúdo">
          {hasText && el.type !== 'input' && <TextField label={el.type === 'card' || el.type === 'modal' ? 'Título' : el.type === 'navbar' ? 'Marca' : 'Texto'} value={el.text ?? ''} multiline={el.type === 'text'} onCommit={(text) => patchSel(() => ({ text }))} />}
          {(el.type === 'card' || el.type === 'modal') && <TextField label="Descrição" value={el.subtext ?? ''} multiline onCommit={(subtext) => patchSel(() => ({ subtext }))} />}
          {el.type === 'input' && (
            <>
              <TextField label="Placeholder" value={el.placeholder ?? ''} onCommit={(placeholder) => patchSel(() => ({ placeholder }))} />
              <TextField label="Valor inicial" value={el.text ?? ''} onCommit={(text) => patchSel(() => ({ text }))} />
            </>
          )}
          {(el.type === 'navbar' || el.type === 'menu') && (
            <TextField label="Itens (um por linha)" multiline value={(el.items ?? []).join('\n')} onCommit={(v) => patchSel(() => ({ items: v.split('\n').map((x) => x.trim()).filter(Boolean) }))} />
          )}
          {el.type === 'image' && (
            <>
              <TextField
                label="URL da imagem"
                value={el.src?.startsWith('data:') || assetRef ? '' : el.src ?? ''}
                placeholder={assetRef ? '(asset da biblioteca)' : el.src?.startsWith('data:') ? '(imagem incorporada)' : 'https://…'}
                onCommit={(src) => patchSel(() => ({ src }))}
              />
              <button className="btn-outline w-full text-xs" onClick={() => setPicking(true)}>Escolher da biblioteca…</button>
              {picking && <AssetPicker kinds={['image', 'vector']} projectId={projectId} onClose={() => setPicking(false)} onPick={(a) => patchSel(() => ({ src: assetUri(a.id), name: el.name === 'Imagem' ? a.name : el.name }))} />}
              <div className="flex gap-1.5">
                <label className="btn-outline flex-1 cursor-pointer text-xs">
                  Enviar imagem…
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" className="hidden" onChange={(e) => void uploadImage(e.target.files?.[0])} />
                </label>
                {el.src && <button className="btn-ghost text-xs" onClick={() => patchSel(() => ({ src: '' }))}>Remover</button>}
              </div>
            </>
          )}
          {!hasText && el.type !== 'image' && <p className="text-[11px] text-ink-400">Este elemento não possui conteúdo textual.</p>}
        </Section>
      )}

      {el.type !== 'group' && (
        <Section title="Aparência">
          <ColorField label="Preenchimento" value={s.fill} onLive={(fill) => styleLive({ fill })} onEnd={end} onCommit={(fill) => styleCommit({ fill: safeColor(fill, s.fill) })} />
          {hasText && <ColorField label="Texto" value={s.textColor} onLive={(textColor) => styleLive({ textColor })} onEnd={end} onCommit={(textColor) => styleCommit({ textColor: safeColor(textColor, s.textColor) })} />}
          {hasText && (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                <NumField label="Tm" title="Tamanho da fonte" value={s.fontSize} min={4} max={400} onCommit={(fontSize) => styleCommit({ fontSize })} />
                <select className="input py-1 text-xs" aria-label="Peso da fonte" value={s.fontWeight} onChange={(e) => styleCommit({ fontWeight: Number(e.target.value) })}>
                  {[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>Peso {w}</option>)}
                </select>
              </div>
              <select className="input py-1 text-xs" aria-label="Fonte" value={s.fontFamily} onChange={(e) => styleCommit({ fontFamily: e.target.value })}>
                <option value="Inter, system-ui, sans-serif">Inter / Sans</option>
                <option value="Georgia, 'Times New Roman', serif">Serif</option>
                <option value="ui-monospace, 'SFMono-Regular', monospace">Monospace</option>
                <option value="'Trebuchet MS', Helvetica, sans-serif">Humanista</option>
              </select>
              <div className="grid grid-cols-3 gap-1">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button key={a} className="icon-btn h-7 w-full text-xs" data-active={s.textAlign === a} onClick={() => styleCommit({ textAlign: a })}>
                    {a === 'left' ? 'Esq.' : a === 'center' ? 'Centro' : 'Dir.'}
                  </button>
                ))}
              </div>
            </>
          )}
          <div className="grid grid-cols-3 gap-1.5">
            <NumField label="R" title="Raio da borda" value={s.borderRadius} min={0} max={9999} onCommit={(borderRadius) => styleCommit({ borderRadius })} />
            <NumField label="B" title="Espessura da borda" value={s.borderWidth} min={0} max={100} onCommit={(borderWidth) => styleCommit({ borderWidth })} />
            <NumField label="P" title="Espaçamento interno (padding)" value={s.padding} min={0} max={500} onCommit={(padding) => styleCommit({ padding })} />
          </div>
          {s.borderWidth > 0 && <ColorField label="Borda" value={s.borderColor} onLive={(borderColor) => styleLive({ borderColor })} onEnd={end} onCommit={(borderColor) => styleCommit({ borderColor: safeColor(borderColor, s.borderColor) })} />}
          <label className="flex items-center gap-2 text-xs">
            <span className="w-20 text-ink-400">Opacidade</span>
            <input type="range" min={0} max={1} step={0.01} value={s.opacity} className="flex-1" onChange={(e) => styleLive({ opacity: Number(e.target.value) })} onPointerUp={end} onKeyUp={end} onBlur={end} />
            <span className="w-8 text-right">{Math.round(s.opacity * 100)}%</span>
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!s.shadow} onChange={(e) => styleCommit({ shadow: e.target.checked ? { x: 0, y: 4, blur: 16, spread: 0, color: 'rgba(0,0,0,0.15)' } : null })} /> Sombra
          </label>
          {s.shadow && (
            <>
              <div className="grid grid-cols-4 gap-1">
                <NumField label="X" value={s.shadow.x} onCommit={(x) => styleCommit({ shadow: { ...s.shadow!, x } })} />
                <NumField label="Y" value={s.shadow.y} onCommit={(y) => styleCommit({ shadow: { ...s.shadow!, y } })} />
                <NumField label="Bl" title="Desfoque" value={s.shadow.blur} min={0} onCommit={(blur) => styleCommit({ shadow: { ...s.shadow!, blur } })} />
                <NumField label="Sp" title="Expansão" value={s.shadow.spread} onCommit={(spread) => styleCommit({ shadow: { ...s.shadow!, spread } })} />
              </div>
              <ColorField label="Cor sombra" value={s.shadow.color} onLive={(color) => styleLive({ shadow: { ...s.shadow!, color } })} onEnd={end} onCommit={(color) => styleCommit({ shadow: { ...s.shadow!, color: safeColor(color, s.shadow!.color) } })} />
            </>
          )}
        </Section>
      )}

      {el.type !== 'group' && (
        <Section
          title="Estado: hover"
          right={
            <input type="checkbox" aria-label="Ativar estado hover" checked={!!el.hover} onChange={(e) => patchSel(() => ({ hover: e.target.checked ? { fill: s.fill, textColor: s.textColor } : null }))} />
          }
        >
          {el.hover ? (
            <>
              <ColorField label="Preench." value={el.hover.fill ?? s.fill} onLive={(fill) => liveSel((x) => ({ hover: { ...x.hover, fill } }))} onEnd={end} onCommit={(fill) => patchSel((x) => ({ hover: { ...x.hover, fill: safeColor(fill, s.fill) } }))} />
              <ColorField label="Texto" value={el.hover.textColor ?? s.textColor} onLive={(textColor) => liveSel((x) => ({ hover: { ...x.hover, textColor } }))} onEnd={end} onCommit={(textColor) => patchSel((x) => ({ hover: { ...x.hover, textColor: safeColor(textColor, s.textColor) } }))} />
              {s.borderWidth > 0 && <ColorField label="Borda" value={el.hover.borderColor ?? s.borderColor} onLive={(borderColor) => liveSel((x) => ({ hover: { ...x.hover, borderColor } }))} onEnd={end} onCommit={(borderColor) => patchSel((x) => ({ hover: { ...x.hover, borderColor: safeColor(borderColor, s.borderColor) } }))} />}
            </>
          ) : (
            <p className="text-[11px] text-ink-400">Ative para definir cores ao passar o mouse (aplicado no protótipo e no código).</p>
          )}
        </Section>
      )}

      <Section title="Interação (protótipo)">
        <select
          className="input py-1 text-xs"
          aria-label="Tipo de interação"
          value={interaction?.type ?? ''}
          onChange={(e) => {
            const t = e.target.value;
            if (!t) setInteraction(null);
            if (t === 'navigate') setInteraction({ type: 'navigate', screenId: doc.screens.find((x) => x.id !== screen.id)?.id ?? screen.id });
            if (t === 'toggle') setInteraction({ type: 'toggle', targetId: toggleTargets.find((x) => x.initiallyHidden)?.id ?? el.id });
            if (t === 'url') setInteraction({ type: 'url', href: 'https://' });
          }}
        >
          <option value="">Nenhuma</option>
          <option value="navigate">Ao clicar: ir para tela</option>
          <option value="toggle">Ao clicar: mostrar/ocultar elemento</option>
          <option value="url">Ao clicar: abrir link externo</option>
        </select>
        {interaction?.type === 'navigate' && (
          <select className="input py-1 text-xs" aria-label="Tela de destino" value={interaction.screenId} onChange={(e) => setInteraction({ type: 'navigate', screenId: e.target.value })}>
            {doc.screens.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        )}
        {interaction?.type === 'toggle' && (
          <select className="input py-1 text-xs" aria-label="Elemento alvo" value={interaction.targetId} onChange={(e) => setInteraction({ type: 'toggle', targetId: e.target.value })}>
            {toggleTargets.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === el.id ? ' (este)' : ''}</option>)}
          </select>
        )}
        {interaction?.type === 'url' && <TextField label="Endereço (http/https)" value={interaction.href} onCommit={(href) => setInteraction({ type: 'url', href })} />}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={el.initiallyHidden} onChange={(e) => patchSel(() => ({ initiallyHidden: e.target.checked }))} /> Oculto ao iniciar (ex.: modais)
        </label>
      </Section>
    </>
  );
}

export function PropertiesPanel() {
  const selected = useWebDesign(useShallow(selectSelected));
  if (!selected.length) return <ScreenProps />;
  if (selected.length > 1) {
    const sel = selected.map((e) => e.id);
    const sameParent = selected.every((e) => e.parentId === selected[0].parentId);
    return (
      <>
        <ArrangeSection multi />
        <Section title="Seleção">
          <button className="btn-outline w-full text-xs" disabled={!sameParent} onClick={() => {
            let gid: string | undefined;
            st().applyScreen((s) => {
              const r = ops.groupElements(s, sel);
              gid = r.groupId;
              return r.screen;
            });
            if (gid) st().select([gid]);
          }}>
            Agrupar (Ctrl+G)
          </button>
          {!sameParent && <p className="text-[11px] text-ink-400">Para agrupar, selecione elementos do mesmo nível.</p>}
        </Section>
        <ElementProps el={selected[0]} multi />
      </>
    );
  }
  const el = selected[0];
  return (
    <>
      <ArrangeSection multi={false} />
      {el.type === 'group' && (
        <Section title="Grupo">
          <button className="btn-outline w-full text-xs" onClick={() => {
            let freed: string[] = [];
            st().applyScreen((s) => {
              const r = ops.ungroupElements(s, [el.id]);
              freed = r.freed;
              return r.screen;
            });
            st().select(freed);
          }}>
            Desagrupar (Ctrl+Shift+G)
          </button>
          <p className="text-[11px] text-ink-400">Clique duplo em um filho no canvas para selecioná-lo dentro do grupo.</p>
        </Section>
      )}
      <ElementProps el={el} />
    </>
  );
}

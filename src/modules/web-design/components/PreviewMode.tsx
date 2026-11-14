import { useEffect, useMemo, useRef, useState } from 'react';
import { safeColor, safeUrl } from '@/core/utils/sanitize';
import { boxCss, DEVICE_PRESETS, renderableElements } from '../layout';
import type { WDElement, WebDesignDoc } from '../model';
import { ElementView } from './ElementView';

interface Props {
  doc: WebDesignDoc;
  startScreenId: string;
  onClose: () => void;
  /** Showcase: clean presentation without the device controls. */
  showcase?: boolean;
}

const initialHidden = (doc: WebDesignDoc) => new Set(doc.screens.flatMap((s) => s.elements.filter((e) => e.initiallyHidden).map((e) => e.id)));

/** Interactive prototype + responsive preview. Uses the same layout CSS as the exported code. */
export function PreviewMode({ doc, startScreenId, onClose, showcase }: Props) {
  const [screenId, setScreenId] = useState(startScreenId);
  const [hidden, setHidden] = useState(() => initialHidden(doc));
  const [historyStack, setHistoryStack] = useState<string[]>([]);
  const screen = doc.screens.find((s) => s.id === screenId) ?? doc.screens[0];
  const [preset, setPreset] = useState<string>('design');
  const [customW, setCustomW] = useState(screen.width);
  const [customH, setCustomH] = useState(screen.height);
  const [rotated, setRotated] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setArea({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const i = doc.screens.findIndex((s) => s.id === screenId);
        const j = Math.min(doc.screens.length - 1, Math.max(0, i + (e.key === 'ArrowRight' ? 1 : -1)));
        if (j !== i && !(e.target instanceof HTMLInputElement)) go(doc.screens[j].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  let vw = screen.width;
  let vh = screen.height;
  if (preset === 'custom') {
    vw = customW;
    vh = customH;
  } else if (preset !== 'design') {
    const p = DEVICE_PRESETS.find((d) => d.id === preset)!;
    vw = p.width;
    vh = p.height;
  }
  if (rotated) [vw, vh] = [vh, vw];
  const pad = 32;
  const scale = Math.min(1, (area.w - pad) / vw, (area.h - pad) / vh);

  const go = (id: string) => {
    setHistoryStack((h) => [...h, screenId]);
    setScreenId(id);
    setHidden(initialHidden(doc));
  };

  const activate = (el: WDElement) => {
    const i = el.interaction;
    if (!i) return;
    if (i.type === 'navigate' && doc.screens.some((s) => s.id === i.screenId)) go(i.screenId);
    if (i.type === 'toggle')
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(i.targetId)) next.delete(i.targetId);
        else next.add(i.targetId);
        return next;
      });
    if (i.type === 'url') {
      const href = safeUrl(i.href);
      if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener');
    }
  };

  const elements = useMemo(() => renderableElements(screen), [screen]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink-950" role="dialog" aria-label="Pré-visualização do protótipo">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 bg-ink-900 px-3 py-2">
        <span className="text-sm font-medium">{showcase ? 'Apresentação' : 'Protótipo'}</span>
        <select className="input w-auto py-1 text-xs" value={screen.id} onChange={(e) => go(e.target.value)} aria-label="Tela">
          {doc.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="btn-ghost text-xs" disabled={!historyStack.length} onClick={() => {
          const prev = historyStack[historyStack.length - 1];
          setHistoryStack((h) => h.slice(0, -1));
          setScreenId(prev);
          setHidden(initialHidden(doc));
        }}>← Voltar</button>
        <button className="btn-ghost text-xs" onClick={() => setHidden(initialHidden(doc))}>Reiniciar estados</button>
        {!showcase && (
          <>
            <select className="input w-auto py-1 text-xs" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Dispositivo">
              <option value="design">Tamanho do design ({screen.width}×{screen.height})</option>
              {DEVICE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label} ({p.width}×{p.height})</option>)}
              <option value="custom">Personalizado…</option>
            </select>
            {preset === 'custom' && (
              <>
                <input className="input w-20 py-1 text-xs" type="number" min={200} max={8000} value={customW} onChange={(e) => setCustomW(Math.max(200, Number(e.target.value) || 200))} aria-label="Largura" />
                <span className="text-xs text-ink-400">×</span>
                <input className="input w-20 py-1 text-xs" type="number" min={200} max={8000} value={customH} onChange={(e) => setCustomH(Math.max(200, Number(e.target.value) || 200))} aria-label="Altura" />
              </>
            )}
            <button className="btn-ghost text-xs" onClick={() => setRotated((r) => !r)} title="Girar dispositivo">⟳ Girar</button>
          </>
        )}
        <span className="text-xs text-ink-400">{vw}×{vh} · {Math.round(scale * 100)}%</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost text-xs" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}>Tela cheia</button>
          <button className="btn-outline text-xs" onClick={onClose}>Fechar (Esc)</button>
        </div>
      </div>
      <div ref={areaRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div style={{ width: vw * scale, height: vh * scale }} className="overflow-hidden rounded-md shadow-2xl ring-1 ring-white/10">
          <div style={{ width: vw, height: vh, transform: `scale(${scale})`, transformOrigin: '0 0', overflowY: 'auto', overflowX: 'hidden', background: safeColor(screen.background, '#fff') }}>
            <main data-testid="preview-screen" style={{ position: 'relative', width: '100%', height: screen.height, minHeight: screen.height }}>
              {elements.map((el) =>
                hidden.has(el.id) ? null : <ElementView key={el.id} el={el} box={boxCss(el, screen)} interactive onActivate={activate} />,
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}

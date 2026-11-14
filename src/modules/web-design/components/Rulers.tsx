import { useEffect, useRef, useState } from 'react';
import { useView } from '../viewStore';

export const RULER = 20;

function step(zoom: number): number {
  const target = 80 / zoom; // ~80px between labelled ticks
  const pow = 10 ** Math.floor(Math.log10(target));
  for (const m of [1, 2, 5, 10]) if (pow * m >= target) return pow * m;
  return pow * 10;
}

/** Top and left rulers (in design pixels). Drag from them to create guides. */
export function Rulers() {
  const { zoom, panX, panY } = useView();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const s = step(zoom);
  const ticks = (len: number, pan: number) => {
    const out: number[] = [];
    const start = Math.floor(-pan / zoom / s) * s;
    const end = (len - pan) / zoom;
    for (let v = start; v <= end; v += s) out.push(v);
    return out;
  };
  return (
    <div ref={ref}>
      <div data-ruler="x" title="Arraste para criar uma guia horizontal" className="absolute left-0 top-0 z-10 cursor-ns-resize overflow-hidden border-b border-ink-700 bg-ink-900" style={{ height: RULER, width: '100%' }}>
        {ticks(size.w, panX).map((v) => (
          <div key={v} className="pointer-events-none absolute top-0 h-full border-l border-ink-600 pl-0.5 text-[9px] leading-[12px] text-ink-400" style={{ left: panX + v * zoom }}>
            {Math.round(v)}
          </div>
        ))}
      </div>
      <div data-ruler="y" title="Arraste para criar uma guia vertical" className="absolute left-0 top-0 z-10 cursor-ew-resize overflow-hidden border-r border-ink-700 bg-ink-900" style={{ width: RULER, height: '100%' }}>
        {ticks(size.h, panY).map((v) => (
          <div key={v} className="pointer-events-none absolute left-0 w-full border-t border-ink-600 text-[9px] leading-[10px] text-ink-400" style={{ top: panY + v * zoom }}>
            <span className="block origin-top-left translate-y-[12px] -rotate-90 pl-0.5">{Math.round(v)}</span>
          </div>
        ))}
      </div>
      <div className="absolute left-0 top-0 z-20 border-b border-r border-ink-700 bg-ink-900" style={{ width: RULER, height: RULER }} />
    </div>
  );
}

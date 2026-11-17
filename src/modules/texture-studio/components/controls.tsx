import type { ReactNode } from 'react';
import { useTextures } from '../store';

/** Slider: live updates while dragging, one undo step when released. */
export function Num({ label, value, min, max, step, onLive, format }: { label: string; value: number; min: number; max: number; step: number; onLive: (v: number) => void; format?: (v: number) => string }) {
  const end = () => useTextures.getState().endGesture();
  return (
    <label className="block text-[11px]">
      <div className="flex justify-between text-ink-300">
        <span>{label}</span>
        <span className="tabular-nums text-ink-400">{format ? format(value) : Number.isInteger(step) ? value : value.toFixed(step < 0.01 ? 4 : step < 0.1 ? 2 : 1)}</span>
      </div>
      <input
        type="range"
        className="w-full accent-accent-500"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onLive(Number(e.target.value))}
        onPointerUp={end}
        onKeyUp={end}
        onBlur={end}
      />
    </label>
  );
}

export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][] | { group: string; items: [T, string][] }[]; onChange: (v: T) => void }) {
  return (
    <label className="block text-[11px] text-ink-300">
      {label}
      <select className="input mt-0.5 py-1 text-xs" value={value} aria-label={label} onChange={(e) => onChange(e.target.value as T)}>
        {(options as unknown[]).map((o, i) =>
          Array.isArray(o) ? (
            <option key={o[0] as string} value={o[0] as string}>{o[1] as string}</option>
          ) : (
            <optgroup key={i} label={(o as { group: string }).group}>
              {(o as { items: [T, string][] }).items.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </optgroup>
          ),
        )}
      </select>
    </label>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}

export function Group({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-ink-800 p-3">
      <div className="mb-2 flex items-center">
        <div className="section-title">{title}</div>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

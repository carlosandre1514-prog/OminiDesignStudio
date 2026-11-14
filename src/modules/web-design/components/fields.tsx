import { useEffect, useState } from 'react';

/** Numeric field that commits on blur / Enter so typing doesn't create one undo step per keystroke. */
export function NumField({ label, value, onCommit, min, max, step = 1, title }: { label: string; value: number | ''; onCommit: (v: number) => void; min?: number; max?: number; step?: number; title?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(value === '' ? '' : String(Math.round(Number(value) * 100) / 100)), [value]);
  const commit = () => {
    const n = Number(text);
    if (text.trim() === '' || !Number.isFinite(n)) return setText(String(value));
    const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (c !== value) onCommit(c);
    else setText(String(value));
  };
  return (
    <label className="flex min-w-0 items-center gap-1.5 rounded border border-ink-700 bg-ink-900 px-1.5 focus-within:border-accent-500" title={title}>
      <span className="w-4 shrink-0 text-[10px] text-ink-400">{label}</span>
      <input
        className="w-full min-w-0 bg-transparent py-1 text-xs outline-none"
        inputMode="decimal"
        value={text}
        step={step}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const n = (Number(text) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            const c = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
            setText(String(c));
            onCommit(c);
          }
        }}
      />
    </label>
  );
}

export function TextField({ label, value, onCommit, multiline, placeholder }: { label: string; value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => text !== value && onCommit(text);
  return (
    <label className="block">
      <span className="label">{label}</span>
      {multiline ? (
        <textarea className="input min-h-16 text-xs" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} />
      ) : (
        <input className="input text-xs" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      )}
    </label>
  );
}

const toHex = (c: string) => (/^#[0-9a-f]{6}$/i.test(c) ? c : /^#[0-9a-f]{3}$/i.test(c) ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : '#000000');

/**
 * Colour field: the native picker updates live (onLive) and records one undo step on close (onEnd);
 * the text box accepts any CSS colour (hex, rgb(), transparent…).
 */
export function ColorField({ label, value, onLive, onEnd, onCommit }: { label: string; value: string; onLive: (v: string) => void; onEnd: () => void; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-ink-400">{label}</span>
      <input type="color" aria-label={label} className="h-7 w-8 shrink-0 cursor-pointer rounded border border-ink-700 bg-transparent" value={toHex(value)} onChange={(e) => onLive(e.target.value)} onBlur={onEnd} />
      <input
        className="input py-1 text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== value && onCommit(text.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="space-y-2 border-b border-ink-800 p-3">
      <div className="flex items-center justify-between">
        <span className="section-title">{title}</span>
        {right}
      </div>
      {children}
    </section>
  );
}

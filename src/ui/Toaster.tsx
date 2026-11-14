import { useToasts } from './toast';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-sm rounded-lg border px-4 py-2.5 text-left text-sm shadow-xl ${
            t.kind === 'error' ? 'border-red-500/40 bg-red-950 text-red-100' : t.kind === 'success' ? 'border-emerald-500/40 bg-emerald-950 text-emerald-100' : 'border-ink-700 bg-ink-850 text-ink-100'
          }`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}

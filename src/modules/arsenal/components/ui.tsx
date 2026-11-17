import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { DeviceProfile } from '../hooks/useDeviceProfile';

/**
 * Design primitives of the Arsenal UI. Sizes follow the device profile:
 * PC = compact (mouse), mobile = 48px touch targets, TV = 56px+ with large type, readable from the couch.
 * Every control shows a strong focus state (cyan glow + scale) for D-pad navigation.
 */
export const ProfileContext = createContext<DeviceProfile>('pc');
export const useProfile = () => useContext(ProfileContext);

export const FOCUS =
  'outline-none transition-[transform,box-shadow,background-color] duration-150 focus-visible:z-10 focus-visible:scale-[1.04] focus-visible:shadow-[0_0_0_3px_#0d1015,0_0_0_6px_#22d3ee,0_0_24px_4px_rgba(34,211,238,0.55)]';

const SIZE: Record<DeviceProfile, string> = {
  pc: 'min-h-8 px-3 text-xs',
  mobile: 'min-h-12 px-4 text-sm',
  tv: 'min-h-14 px-5 text-lg',
};

type Variant = 'primary' | 'ghost' | 'outline' | 'chip';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-cyan-400 font-semibold text-black hover:bg-cyan-300 disabled:opacity-40',
  ghost: 'text-zinc-200 hover:bg-white/10 disabled:opacity-40',
  outline: 'border border-white/15 text-zinc-100 hover:bg-white/10 disabled:opacity-40',
  chip: 'border border-white/15 text-zinc-200 hover:bg-white/10 aria-pressed:border-cyan-400 aria-pressed:bg-cyan-400/15 aria-pressed:text-white',
};

export function Btn({ variant = 'outline', className = '', children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const p = useProfile();
  return (
    <button type="button" className={`inline-flex items-center justify-center gap-2 rounded-lg ${SIZE[p]} ${VARIANT[variant]} ${FOCUS} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function Section({ title, icon, children, right }: { title: string; icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  const p = useProfile();
  return (
    <section className={`border-b border-white/10 ${p === 'pc' ? 'p-3' : p === 'tv' ? 'p-5' : 'p-4'}`}>
      <div className="mb-2 flex items-center gap-2">
        {icon && <span className="text-cyan-300">{icon}</span>}
        <h2 className={`font-semibold uppercase tracking-wider text-zinc-400 ${p === 'tv' ? 'text-base' : 'text-[11px]'}`}>{title}</h2>
        {right && <div className="ml-auto">{right}</div>}
      </div>
      <div className={p === 'pc' ? 'space-y-2' : 'space-y-3'}>{children}</div>
    </section>
  );
}

export function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const p = useProfile();
  return (
    <label className={`block ${p === 'tv' ? 'text-lg' : p === 'mobile' ? 'text-sm' : 'text-xs'}`}>
      <div className="mb-1 flex justify-between text-zinc-300">
        <span>{label}</span>
        <span className="tabular-nums text-cyan-200">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full cursor-pointer accent-cyan-400 ${p === 'pc' ? 'h-4' : 'h-8'} rounded ${FOCUS} focus-visible:scale-100`}
      />
    </label>
  );
}

/** Row of mutually exclusive options (D-pad friendly replacement for <select>). */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const p = useProfile();
  return (
    <div role="group" aria-label={label}>
      <div className={`mb-1 text-zinc-400 ${p === 'tv' ? 'text-base' : 'text-xs'}`}>{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Btn key={o.id} variant="chip" aria-pressed={o.id === value} onClick={() => onChange(o.id)}>
            {o.label}
          </Btn>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Btn variant="chip" role="switch" aria-checked={checked} aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span className={`inline-block h-3 w-3 rounded-full ${checked ? 'bg-cyan-300' : 'bg-zinc-600'}`} />
      {label}
    </Btn>
  );
}

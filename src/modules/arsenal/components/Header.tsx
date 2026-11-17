import { Activity, ArrowLeft, Crosshair, Loader2, Monitor, Smartphone, Triangle, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import type { DeviceProfile } from '../hooks/useDeviceProfile';
import { useArsenal, weaponById } from '../store';
import { FOCUS, useProfile } from './ui';

const PROFILES: { id: DeviceProfile; label: string; icon: typeof Monitor }[] = [
  { id: 'pc', label: 'Computador', icon: Monitor },
  { id: 'mobile', label: 'Celular', icon: Smartphone },
  { id: 'tv', label: 'Smart TV', icon: Tv },
];

/** Title, generation status, FPS and polygon counters, layout switcher. */
export function Header({ forced, onProfile }: { forced: DeviceProfile | null; onProfile: (p: DeviceProfile | null) => void }) {
  const p = useProfile();
  const { status, fps, tris, name } = useArsenal(useShallow((s) => ({ status: s.status, fps: s.stats.fps, tris: s.stats.tris, name: s.source === 'image' ? `Silhueta: ${s.imageName}` : weaponById(s.weaponId).name })));
  const big = p === 'tv';
  return (
    <header className={`flex items-center ${p === 'mobile' ? 'gap-1.5' : 'gap-3'} border-b border-white/10 bg-[#0b0e13] ${big ? 'px-6 py-3' : 'px-3 py-2'}`}>
      <Link to="/" aria-label="Voltar ao início" className={`rounded-lg p-2 text-zinc-300 hover:bg-white/10 ${FOCUS}`}>
        <ArrowLeft size={big ? 26 : 18} />
      </Link>
      {p !== 'mobile' && <Crosshair className="shrink-0 text-cyan-300" size={big ? 30 : 20} />}
      <div className="min-w-0">
        <h1 className={`truncate font-semibold text-white ${big ? 'text-2xl' : 'text-sm'}`}>Arsenal 3D</h1>
        <p className={`truncate text-zinc-400 ${big ? 'text-base' : 'text-[11px]'} ${p === 'mobile' ? 'max-w-24' : ''}`} data-testid="arsenal-model-name">{name}</p>
      </div>

      <div
        role="status"
        aria-live="polite"
        data-testid="arsenal-status"
        className={`flex min-w-0 shrink items-center gap-2 rounded-full border py-1 ${p === 'mobile' ? 'ml-0 px-2' : 'ml-2 px-3'} ${big ? 'text-base' : 'text-xs'} ${
          status.kind === 'busy' ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : status.kind === 'error' ? 'border-red-400/40 bg-red-500/10 text-red-200' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
        }`}
      >
        {status.kind === 'busy' ? <Loader2 className="animate-spin" size={14} /> : <span className={`h-2 w-2 rounded-full ${status.kind === 'error' ? 'bg-red-400' : 'bg-emerald-400'}`} />}
        <span className="truncate">{status.text}</span>
      </div>

      <div className={`ml-auto flex shrink-0 items-center ${p === 'mobile' ? 'gap-1.5' : 'gap-3'} tabular-nums text-zinc-300 ${big ? 'text-lg' : 'text-xs'}`}>
        <span className="flex items-center gap-1 whitespace-nowrap" title="Quadros por segundo" data-testid="arsenal-fps">
          <Activity size={big ? 20 : 14} className="text-cyan-300" /> {fps} FPS
        </span>
        <span className={`items-center gap-1 ${p === 'mobile' ? 'hidden' : 'flex'}`} title="Triângulos visíveis" data-testid="arsenal-tris">
          <Triangle size={big ? 18 : 13} className="text-cyan-300" /> {Math.round(tris).toLocaleString('pt-BR')} tris
        </span>
        <div className="flex items-center gap-1" role="group" aria-label="Layout">
          {PROFILES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={`Layout ${label}`}
              aria-pressed={p === id}
              title={`${label}${forced === id ? ' (fixado)' : ''}`}
              onClick={() => onProfile(forced === id ? null : id)}
              className={`rounded-lg p-2 ${p === id ? 'bg-cyan-400/15 text-cyan-200' : 'text-zinc-400 hover:bg-white/10'} ${FOCUS}`}
            >
              <Icon size={big ? 24 : 16} />
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}

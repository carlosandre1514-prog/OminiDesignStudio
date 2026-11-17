import { Download, Gamepad2, Layers, Maximize, Palette, Pause, Play, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArsenalCanvas, type CameraApi, type CameraView } from './canvas/ArsenalCanvas';
import { useArsenal, WEAPON_IDS } from './store';
import { ExportBar } from './components/ExportBar';
import { Header } from './components/Header';
import { MaterialsPanel, StudioTexturesPanel } from './components/MaterialsPanel';
import { PartsInspector } from './components/PartsInspector';
import { ModelPanel, PromptPanel } from './components/PromptPanel';
import { Btn, FOCUS, ProfileContext } from './components/ui';
import { useDeviceProfile, type DeviceProfile } from './hooks/useDeviceProfile';
import { useSpatialNavigation } from './hooks/useSpatialNavigation';

type Tab = 'gerar' | 'pecas' | 'materiais' | 'exportar';
const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'gerar', label: 'Gerar', icon: Sparkles },
  { id: 'pecas', label: 'Peças', icon: Layers },
  { id: 'materiais', label: 'Materiais', icon: Palette },
  { id: 'exportar', label: 'Exportar', icon: Download },
];

const ORBIT_STEP = 0.18;

/**
 * 3D viewport wrapper. It is focusable so a TV remote can reach it:
 * OK/Enter enters "camera mode" (arrows orbit, +/− or Channel ▲/▼ zoom, 0 re-frames),
 * OK/Back leaves it and arrows navigate the interface again.
 */
function Viewport({ profile }: { profile: DeviceProfile }) {
  const cam = useRef<CameraApi>(null);
  const [cameraMode, setCameraMode] = useState(false);
  const [autoRotate, setAutoRotate] = useState(profile === 'tv');
  useEffect(() => setAutoRotate(profile === 'tv'), [profile]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (!cameraMode) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setCameraMode(true);
        setAutoRotate(false);
      }
      return;
    }
    const c = cam.current;
    const map: Record<string, () => void> = {
      ArrowLeft: () => c?.orbit(-ORBIT_STEP, 0),
      ArrowRight: () => c?.orbit(ORBIT_STEP, 0),
      ArrowUp: () => c?.orbit(0, -ORBIT_STEP * 0.7),
      ArrowDown: () => c?.orbit(0, ORBIT_STEP * 0.7),
      '+': () => c?.zoom(0.85),
      '=': () => c?.zoom(0.85),
      PageUp: () => c?.zoom(0.85),
      ChannelUp: () => c?.zoom(0.85),
      '-': () => c?.zoom(1.18),
      PageDown: () => c?.zoom(1.18),
      ChannelDown: () => c?.zoom(1.18),
      '0': () => c?.frame(),
      f: () => c?.frame(),
      Enter: () => setCameraMode(false),
      Escape: () => setCameraMode(false),
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      e.stopPropagation();
      fn();
    }
  };

  return (
    <div
      tabIndex={0}
      role="application"
      aria-label={cameraMode ? 'Viewport 3D — modo câmera: setas giram, + e − aproximam, OK sai' : 'Viewport 3D — pressione OK para controlar a câmera'}
      aria-roledescription="visualizador 3D"
      data-nav-capture={cameraMode ? 'arrows' : undefined}
      data-testid="arsenal-viewport"
      onKeyDown={onKeyDown}
      onBlur={() => setCameraMode(false)}
      className={`relative h-full w-full touch-none overflow-hidden rounded-none outline-none ${cameraMode ? 'shadow-[inset_0_0_0_4px_#22d3ee]' : 'focus:shadow-[inset_0_0_0_4px_rgba(34,211,238,0.75)]'}`}
    >
      <ArsenalCanvas ref={cam} autoRotate={autoRotate} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
        <div className={`rounded-md bg-black/55 px-2 py-1 text-zinc-300 ${profile === 'tv' ? 'text-base' : 'text-[10px]'}`}>
          {profile === 'tv'
            ? cameraMode
              ? '↑↓←→ girar · +/− zoom · 0 enquadrar · OK sair'
              : 'OK: controlar câmera'
            : profile === 'mobile'
              ? 'Arraste para girar · pinça para zoom · toque numa peça'
              : 'Arraste: girar · botão direito: mover · roda: zoom · clique: selecionar peça'}
        </div>
        <div className="pointer-events-auto flex gap-1.5">
          <Btn variant="outline" className="bg-black/50" onClick={() => setAutoRotate((v) => !v)} aria-label={autoRotate ? 'Parar rotação' : 'Girar automaticamente'} tabIndex={profile === 'tv' ? -1 : 0}>
            {autoRotate ? <Pause size={16} /> : <Play size={16} />}
          </Btn>
          {(
            [
              ['persp', '3/4'],
              ['side', 'Lado'],
              ['top', 'Topo'],
              ['front', 'Frente'],
            ] as [CameraView, string][]
          ).map(([v, label]) => (
            <Btn key={v} variant="outline" className="bg-black/50" onClick={() => { setAutoRotate(false); cam.current?.view(v); }} aria-label={`Vista ${label}`} tabIndex={profile === 'tv' ? -1 : 0} data-testid={`view-${v}`}>
              {label}
            </Btn>
          ))}
          <Btn variant="outline" className="bg-black/50" onClick={() => cam.current?.frame()} aria-label="Enquadrar arma" tabIndex={profile === 'tv' ? -1 : 0}>
            <Maximize size={16} />
          </Btn>
        </div>
      </div>
      {profile === 'tv' && !cameraMode && (
        <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-black/55 px-3 py-2 text-lg text-cyan-100">
          <Gamepad2 size={22} /> Controle remoto: setas navegam · OK seleciona
        </div>
      )}
    </div>
  );
}

function TabPanels({ tab }: { tab: Tab }) {
  return (
    <>
      {tab === 'gerar' && (
        <>
          <PromptPanel />
          <ModelPanel />
        </>
      )}
      {tab === 'pecas' && <PartsInspector />}
      {tab === 'materiais' && (
        <>
          <MaterialsPanel />
          <StudioTexturesPanel />
        </>
      )}
      {tab === 'exportar' && (
        <div className="p-4">
          <ExportBar compact />
        </div>
      )}
    </>
  );
}

function TabBar({ tab, setTab, vertical, big }: { tab: Tab; setTab: (t: Tab) => void; vertical?: boolean; big?: boolean }) {
  return (
    <nav role="tablist" aria-label="Painéis" className={`flex ${vertical ? 'flex-col gap-2 p-3' : 'gap-1 border-y border-white/10 bg-[#0b0e13] p-1.5'}`}>
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          data-testid={`arsenal-tab-${id}`}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg font-medium ${big ? 'min-h-16 justify-start px-5 text-xl' : 'min-h-12 flex-col gap-0.5 text-xs'} ${tab === id ? 'bg-cyan-400/15 text-cyan-100' : 'text-zinc-400'} ${FOCUS}`}
        >
          <Icon size={big ? 26 : 20} />
          {label}
        </button>
      ))}
    </nav>
  );
}

function Shell({ profile, header, children }: { profile: DeviceProfile; header: ReactNode; children: ReactNode }) {
  return (
    <ProfileContext.Provider value={profile}>
      <div className="flex h-dvh flex-col overflow-hidden bg-[#0d1015] text-zinc-100" data-profile={profile} data-testid="arsenal-root">
        {header}
        {children}
      </div>
    </ProfileContext.Provider>
  );
}

/**
 * Arsenal 3D — generation, inspection and customisation of hard-surface weapons.
 * One codebase, three layouts: PC (pro side panels), mobile (stacked, touch-first) and Smart TV
 * (D-pad spatial navigation with strong focus highlight).
 */
export default function ArsenalApp() {
  const { profile, forced, setProfile } = useDeviceProfile();
  const [tab, setTab] = useState<Tab>('gerar');
  const root = useRef<HTMLDivElement>(null);
  // Deep link: /arsenal?arma=<id> opens that weapon directly (shareable).
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('arma');
    if (id && WEAPON_IDS.includes(id)) useArsenal.getState().setWeapon(id);
  }, []);
  const onBack = useCallback(() => {
    const a = document.activeElement as HTMLElement | null;
    // Back: from a panel control, return to the tab list; from the tab list, go to the viewport.
    const tabEl = document.querySelector<HTMLElement>(`[data-testid="arsenal-tab-${tab}"]`);
    if (tabEl && a !== tabEl) tabEl.focus();
    else document.querySelector<HTMLElement>('[data-testid="arsenal-viewport"]')?.focus();
  }, [tab]);
  // Arrow-key navigation is always on for TV; on PC it helps keyboard users too (mobile has no D-pad).
  useSpatialNavigation({ enabled: profile !== 'mobile', root: () => root.current, onBack: profile === 'tv' ? onBack : undefined });

  useEffect(() => {
    document.title = 'Arsenal 3D — OmniDesign Studio';
    // TV: start with focus on the viewport so the first OK press controls the camera.
    if (profile === 'tv') requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="arsenal-viewport"]')?.focus());
  }, [profile]);

  const header = <Header forced={forced} onProfile={setProfile} />;

  if (profile === 'mobile')
    return (
      <Shell profile={profile} header={header}>
        <div ref={root} className="flex min-h-0 flex-1 flex-col">
          <div className="h-[46dvh] shrink-0">
            <Viewport profile={profile} />
          </div>
          <TabBar tab={tab} setTab={setTab} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6" role="tabpanel">
            <TabPanels tab={tab} />
          </div>
        </div>
      </Shell>
    );

  if (profile === 'tv')
    return (
      <Shell profile={profile} header={header}>
        <div ref={root} className="flex min-h-0 flex-1">
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
              <Viewport profile={profile} />
            </div>
            <ExportBar />
          </main>
          <aside className="flex w-[480px] shrink-0 border-l border-white/10 bg-[#10141a]">
            <div className="w-44 shrink-0 border-r border-white/10">
              <TabBar tab={tab} setTab={setTab} vertical big />
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto" role="tabpanel">
              <TabPanels tab={tab} />
            </div>
          </aside>
        </div>
      </Shell>
    );

  return (
    <Shell profile={profile} header={header}>
      <div ref={root} className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)_300px] xl:grid-cols-[360px_minmax(0,1fr)_330px]">
        <aside className="min-h-0 overflow-y-auto border-r border-white/10 bg-[#10141a]" aria-label="Geração">
          <PromptPanel />
          <ModelPanel />
        </aside>
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="min-h-0 flex-1">
            <Viewport profile={profile} />
          </div>
          <ExportBar />
        </main>
        <aside className="min-h-0 overflow-y-auto border-l border-white/10 bg-[#10141a]" aria-label="Inspector">
          <PartsInspector />
          <MaterialsPanel />
          <StudioTexturesPanel />
        </aside>
      </div>
    </Shell>
  );
}

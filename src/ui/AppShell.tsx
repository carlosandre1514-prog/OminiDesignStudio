import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { listModules } from '@/core/modules/registry';
import { useOnline } from '@/hooks/useOnline';

const NAV = [
  { to: '/', label: 'Dashboard', icon: '⌂', end: true },
  { to: '/projects', label: 'Projetos', icon: '▤' },
  { to: '/assets', label: 'Biblioteca', icon: '◫' },
  { to: '/templates', label: 'Modelos', icon: '❏' },
  { to: '/history', label: 'Histórico', icon: '↺' },
  { to: '/storage', label: 'Armazenamento', icon: '⛁' },
  { to: '/settings', label: 'Configurações', icon: '⚙' },
];

function NavItem({ to, end, icon, children, onClick }: { to: string; end?: boolean; icon: string; children: ReactNode; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${isActive ? 'bg-accent-500/15 text-accent-400' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'}`
      }
    >
      <span className="w-4 text-center" aria-hidden>{icon}</span>
      {children}
    </NavLink>
  );
}

export function StatusIndicators() {
  const online = useOnline();
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-2" title={online ? 'Conectado à internet' : 'Sem conexão: tudo continua funcionando localmente'}>
        <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className="text-ink-300">{online ? 'Online' : 'Offline — modo local'}</span>
      </div>
      <div className="flex items-center gap-2" title="A sincronização em nuvem será adicionada na Fase 6. Todos os dados estão salvos neste dispositivo.">
        <span className="h-2 w-2 rounded-full bg-ink-600" />
        <span className="text-ink-400">Sincronização: somente local</span>
      </div>
    </div>
  );
}

export function AppShell() {
  const [open, setOpen] = useState(false);
  const modules = listModules();
  const close = () => setOpen(false);
  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-ink-800 bg-ink-900">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <img src="/icon.svg" alt="" className="h-8 w-8" />
        <div>
          <div className="text-sm font-semibold tracking-tight">OmniDesign Studio</div>
          <div className="text-[11px] text-ink-400">Estúdio universal de criação</div>
        </div>
      </div>
      <nav className="space-y-0.5 px-2">
        {NAV.map((n) => (
          <NavItem key={n.to} to={n.to} end={n.end} icon={n.icon} onClick={close}>
            {n.label}
          </NavItem>
        ))}
      </nav>
      <div className="mt-5 px-4 section-title">Módulos</div>
      <ul className="mt-2 space-y-0.5 px-2">
        {modules.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-ink-300" title={m.description}>
            <span className="w-4 text-center" aria-hidden>{m.icon}</span>
            <span className={m.status === 'planned' ? 'text-ink-400' : ''}>{m.name}</span>
            {m.status === 'planned' ? (
              <span className="ml-auto rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-400">Fase {m.phase}</span>
            ) : (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" title="Disponível" />
            )}
          </li>
        ))}
      </ul>
      <p className="px-5 pt-2 text-[11px] leading-relaxed text-ink-400">Os módulos disponíveis abrem a partir de um projeto.</p>
      <div className="mt-auto border-t border-ink-800 px-4 py-3">
        <StatusIndicators />
      </div>
    </aside>
  );
  return (
    <div className="flex h-full">
      <div className="hidden lg:block">{sidebar}</div>
      {open && (
        <div className="fixed inset-0 z-40 flex lg:hidden" onClick={close}>
          <div onClick={(e) => e.stopPropagation()}>{sidebar}</div>
          <div className="flex-1 bg-black/50" />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-800 px-4 py-2.5 lg:hidden">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Abrir menu">☰</button>
          <span className="text-sm font-semibold">OmniDesign Studio</span>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

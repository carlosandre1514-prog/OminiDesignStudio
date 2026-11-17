import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createProject, listProjects } from '@/core/projects/projectService';
import { libraryStats } from '@/core/assets/assetService';
import { formatBytes } from '@/core/utils/download';
import { listModules } from '@/core/modules/registry';
import { NewProjectDialog } from '@/ui/NewProjectDialog';
import { ProjectCard } from '@/ui/ProjectCard';
import { importProjectFromFile, pickFile, PROJECT_ACCEPT } from '@/ui/projectActions';
import { TEMPLATES } from '@/templates/templates';
import { StatusIndicators } from '@/ui/AppShell';

export default function Dashboard() {
  const navigate = useNavigate();
  const projects = useLiveQuery(() => listProjects(), []);
  const lib = useLiveQuery(() => libraryStats(), []);
  const [newOpen, setNewOpen] = useState(false);
  const [tpl, setTpl] = useState<string | undefined>();
  const recent = [...(projects ?? [])].sort((a, b) => (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt)).slice(0, 8);
  const favorites = (projects ?? []).filter((p) => p.favorite);

  /** New texture project opened straight in the texture studio (engine loaded on demand). */
  const newTexture = async () => {
    const { docFromPreset } = await import('@/modules/texture-studio/engine/presets');
    const meta = await createProject({ name: 'Nova textura', category: '3d', modules: { 'texture-studio': docFromPreset('cerakote-black', 'Nova textura') }, tags: ['textura'] });
    navigate(`/project/${meta.id}/texture-studio`);
  };

  const openImport = async () => {
    const f = await pickFile(PROJECT_ACCEPT);
    if (!f) return;
    const id = await importProjectFromFile(f);
    if (id) navigate(`/project/${id}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-400">Uma plataforma, múltiplas disciplinas de criação, um único ecossistema.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/arsenal" className="btn-outline" data-testid="open-arsenal">⌖ Arsenal 3D</Link>
          <button className="btn-outline" onClick={newTexture} data-testid="new-texture">▦ Estúdio de Texturas</button>
          <button className="btn-outline" onClick={openImport}>Abrir / importar…</button>
          <button className="btn-primary" onClick={() => { setTpl(undefined); setNewOpen(true); }}>+ Novo projeto</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="panel p-4">
          <div className="section-title">Projetos</div>
          <div className="mt-2 text-2xl font-semibold">{projects?.length ?? '…'}</div>
        </div>
        <div className="panel p-4">
          <div className="section-title">Favoritos</div>
          <div className="mt-2 text-2xl font-semibold">{projects ? favorites.length : '…'}</div>
        </div>
        <Link to="/assets" className="panel p-4 hover:border-ink-700">
          <div className="section-title">Biblioteca</div>
          <div className="mt-2 text-2xl font-semibold">{lib?.count ?? '…'} <span className="text-sm font-normal text-ink-400">{lib ? formatBytes(lib.bytes) : ''}</span></div>
        </Link>
        <div className="panel p-4">
          <div className="section-title">Módulos disponíveis</div>
          <div className="mt-2 text-2xl font-semibold">{listModules().filter((m) => m.status === 'available').length} <span className="text-sm font-normal text-ink-400">de {listModules().length}</span></div>
        </div>
        <div className="panel p-4">
          <div className="section-title mb-2">Status</div>
          <StatusIndicators />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Projetos recentes</h2>
          <Link to="/projects" className="text-sm text-accent-400 hover:underline">Ver todos</Link>
        </div>
        {projects && projects.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-sm text-ink-300">Nenhum projeto ainda. Crie o primeiro ou comece a partir de um modelo.</p>
            <button className="btn-primary" onClick={() => setNewOpen(true)}>Criar projeto</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recent.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </section>

      {favorites.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold">Favoritos</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {favorites.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Começar a partir de um modelo</h2>
          <Link to="/templates" className="text-sm text-accent-400 hover:underline">Todos os modelos</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="panel p-4 text-left transition-colors hover:border-accent-500/60" onClick={() => { setTpl(t.id); setNewOpen(true); }}>
              <div className="text-sm font-medium">{t.name}</div>
              <div className="mt-1 text-xs text-ink-400">{t.description}</div>
            </button>
          ))}
        </div>
      </section>

      {newOpen && <NewProjectDialog open onClose={() => setNewOpen(false)} initialTemplate={tpl} />}
    </div>
  );
}

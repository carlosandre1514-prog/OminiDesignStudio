import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { db } from '@/core/db/database';
import { defaultModuleFor, getModule, listModules } from '@/core/modules/registry';
import { updateProjectMeta } from '@/core/projects/projectService';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ProjectDetailsDialog } from '@/ui/ProjectDetailsDialog';

/** Project workspace: hosts the module editors for one project. */
export default function Workspace() {
  const { projectId = '', moduleId } = useParams();
  const navigate = useNavigate();
  const project = useLiveQuery(() => db.projects.get(projectId).then((p) => p ?? null), [projectId]);
  const [details, setDetails] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (project) void updateProjectMeta(project.id, { lastOpenedAt: Date.now() });
    // only when a project is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  if (project === undefined) return <div className="p-8 text-sm text-ink-400">Carregando projeto…</div>;
  if (project === null)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <p>Projeto não encontrado.</p>
        <Link to="/" className="btn-primary">Voltar</Link>
      </div>
    );

  if (!moduleId) {
    const mod = defaultModuleFor(project.category);
    return mod ? <Navigate to={`/project/${project.id}/${mod.id}`} replace /> : <div className="p-8">Nenhum módulo disponível.</div>;
  }

  const mod = getModule(moduleId);
  const Editor = mod?.status === 'available' ? mod.editor : undefined;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-ink-800 bg-ink-900 px-2 py-1.5 sm:px-3">
        <Link to="/" className="icon-btn" title="Dashboard" aria-label="Voltar ao Dashboard">⌂</Link>
        <button className="min-w-0 truncate rounded px-2 py-1 text-sm font-medium hover:bg-ink-800" onClick={() => setDetails(true)} title="Detalhes, versões e histórico">
          {project.name}
        </button>
        <nav className="ml-auto flex items-center gap-1 overflow-x-auto" aria-label="Módulos">
          {listModules().map((m) => (
            <button
              key={m.id}
              disabled={m.status !== 'available'}
              onClick={() => navigate(`/project/${project.id}/${m.id}`)}
              title={m.status === 'available' ? m.description : `${m.name} — disponível na Fase ${m.phase}`}
              className={`whitespace-nowrap rounded px-2.5 py-1 text-xs ${m.id === moduleId ? 'bg-accent-500/20 text-accent-400' : 'text-ink-300 hover:bg-ink-800'} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              <span aria-hidden className="mr-1">{m.icon}</span>
              <span className="hidden md:inline">{m.name}</span>
            </button>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1">
        {!mod && <div className="p-8">Módulo desconhecido.</div>}
        {mod && !Editor && (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div className="panel max-w-md p-6">
              <h2 className="font-semibold">{mod.name}</h2>
              <p className="mt-2 text-sm text-ink-400">{mod.description}</p>
              <p className="mt-3 text-sm text-amber-300/90">Este módulo será entregue na Fase {mod.phase} e ainda não está disponível.</p>
            </div>
          </div>
        )}
        {Editor && (
          <ErrorBoundary title={`Erro no módulo ${mod!.name}`} onReset={() => setReloadKey((k) => k + 1)}>
            <Suspense fallback={<div className="p-8 text-sm text-ink-400">Carregando {mod!.name}…</div>}>
              <Editor key={`${project.id}-${reloadKey}`} projectId={project.id} />
            </Suspense>
          </ErrorBoundary>
        )}
      </div>
      {details && <ProjectDetailsDialog project={project} onClose={() => setDetails(false)} onRestored={() => { setDetails(false); setReloadKey((k) => k + 1); }} />}
    </div>
  );
}

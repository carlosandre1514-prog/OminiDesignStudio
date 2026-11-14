import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { deleteProject, duplicateProject, updateProjectMeta } from '@/core/projects/projectService';
import { PROJECT_CATEGORIES, type ProjectMeta } from '@/core/projects/types';
import { ProjectDetailsDialog } from './ProjectDetailsDialog';
import { exportProjectFile, exportProjectPackage } from './projectActions';
import { toast } from './toast';

export const fmtDate = (t: number) => new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
export const categoryLabel = (c: string) => PROJECT_CATEGORIES.find((x) => x.id === c)?.label ?? c;

export function ProjectCard({ project }: { project: ProjectMeta }) {
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setMenu(false);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="group panel relative overflow-hidden transition-colors hover:border-ink-700">
      <Link to={`/project/${project.id}`} className="block">
        <div className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-ink-850">
          {project.thumbnail ? (
            <img src={project.thumbnail} alt="" className="h-full w-full object-cover object-top" />
          ) : (
            <span className="text-3xl text-ink-600">▣</span>
          )}
        </div>
      </Link>
      <div className="p-3">
        <div className="flex items-start gap-2">
          <Link to={`/project/${project.id}`} className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{project.name}</div>
            <div className="mt-0.5 truncate text-xs text-ink-400">{categoryLabel(project.category)} · {fmtDate(project.updatedAt)}</div>
          </Link>
          <button
            className="icon-btn h-7 w-7"
            aria-label={project.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            title={project.favorite ? 'Remover dos favoritos' : 'Favoritar'}
            onClick={() => run(() => updateProjectMeta(project.id, { favorite: !project.favorite }))}
          >
            <span className={project.favorite ? 'text-amber-400' : ''}>{project.favorite ? '★' : '☆'}</span>
          </button>
          <div className="relative">
            <button className="icon-btn h-7 w-7" aria-label="Ações do projeto" onClick={() => setMenu((v) => !v)}>⋯</button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 bottom-8 z-20 w-48 rounded-lg border border-ink-700 bg-ink-850 py-1 text-sm shadow-xl">
                  <button className="block w-full px-3 py-1.5 text-left hover:bg-ink-800" onClick={() => navigate(`/project/${project.id}`)}>Abrir</button>
                  <button className="block w-full px-3 py-1.5 text-left hover:bg-ink-800" onClick={() => { setMenu(false); setDetails(true); }}>Detalhes e versões</button>
                  <button className="block w-full px-3 py-1.5 text-left hover:bg-ink-800" onClick={() => run(() => duplicateProject(project.id), 'Projeto duplicado')}>Duplicar</button>
                  <button className="block w-full px-3 py-1.5 text-left hover:bg-ink-800" onClick={() => run(() => exportProjectFile(project.id, project.name))}>Exportar (.omni)</button>
                  <button className="block w-full px-3 py-1.5 text-left hover:bg-ink-800" onClick={() => run(() => exportProjectPackage(project.id, project.name))}>Exportar pacote (.zip + assets)</button>
                  <button
                    className="block w-full px-3 py-1.5 text-left text-red-300 hover:bg-ink-800"
                    onClick={() => {
                      if (confirm(`Excluir "${project.name}" permanentemente? Esta ação não pode ser desfeita.`)) void run(() => deleteProject(project.id), 'Projeto excluído');
                      else setMenu(false);
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {details && <ProjectDetailsDialog project={project} onClose={() => setDetails(false)} />}
    </div>
  );
}

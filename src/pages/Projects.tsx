import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listProjects } from '@/core/projects/projectService';
import { PROJECT_CATEGORIES } from '@/core/projects/types';
import { NewProjectDialog } from '@/ui/NewProjectDialog';
import { ProjectCard } from '@/ui/ProjectCard';
import { importProjectFromFile, pickFile, PROJECT_ACCEPT } from '@/ui/projectActions';

type Sort = 'updated' | 'created' | 'name';

export default function Projects() {
  const navigate = useNavigate();
  const projects = useLiveQuery(() => listProjects(), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState<Sort>('updated');
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (projects ?? [])
      .filter((p) => (!cat || p.category === cat) && (!favOnly || p.favorite))
      .filter((p) => !term || p.name.toLowerCase().includes(term) || p.description.toLowerCase().includes(term) || p.tags.some((t) => t.toLowerCase().includes(term)))
      .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt));
  }, [projects, q, cat, favOnly, sort]);

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
        <div className="flex gap-2">
          <button
            className="btn-outline"
            onClick={async () => {
              const f = await pickFile(PROJECT_ACCEPT);
              const id = f && (await importProjectFromFile(f));
              if (id) navigate(`/project/${id}`);
            }}
          >
            Importar…
          </button>
          <button className="btn-primary" onClick={() => setNewOpen(true)}>+ Novo projeto</button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="input max-w-xs" placeholder="Pesquisar por nome, descrição ou tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar projetos" />
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar categoria">
          <option value="">Todas as categorias</option>
          {PROJECT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="updated">Última modificação</option>
          <option value="created">Data de criação</option>
          <option value="name">Nome</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-300">
          <input type="checkbox" checked={favOnly} onChange={(e) => setFavOnly(e.target.checked)} /> Somente favoritos
        </label>
      </div>
      {projects && filtered.length === 0 && <p className="text-sm text-ink-400">Nenhum projeto encontrado.</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
      </div>
      {newOpen && <NewProjectDialog open onClose={() => setNewOpen(false)} />}
    </div>
  );
}

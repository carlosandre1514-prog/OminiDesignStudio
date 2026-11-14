import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '@/core/db/database';
import { fmtDate } from '@/ui/ProjectCard';

export default function History() {
  const data = useLiveQuery(async () => {
    const rows = await db.history.orderBy('at').reverse().limit(300).toArray();
    const projects = new Map((await db.projects.toArray()).map((p) => [p.id, p.name]));
    return rows.map((r) => ({ ...r, projectName: projects.get(r.projectId) }));
  }, []);
  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Histórico de projetos</h1>
      <div className="panel divide-y divide-ink-800">
        {data?.length === 0 && <p className="p-4 text-sm text-ink-400">Nenhuma atividade registrada.</p>}
        {data?.map((r) => (
          <div key={r.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
            <span className="w-36 shrink-0 text-xs text-ink-400">{fmtDate(r.at)}</span>
            {r.projectName ? (
              <Link to={`/project/${r.projectId}`} className="w-48 shrink-0 truncate text-accent-400 hover:underline">{r.projectName}</Link>
            ) : (
              <span className="w-48 shrink-0 truncate text-ink-400">(projeto excluído)</span>
            )}
            <span className="text-ink-300">{r.action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  createVersion,
  deleteVersion,
  estimateProjectSize,
  getHistory,
  listVersions,
  restoreVersion,
  updateProjectMeta,
} from '@/core/projects/projectService';
import { PROJECT_CATEGORIES, type ProjectCategory, type ProjectMeta } from '@/core/projects/types';
import { formatBytes } from '@/core/utils/download';
import { useCloud } from '@/core/cloud/cloudStore';
import { db } from '@/core/db/database';
import { Modal } from './Modal';
import { fmtDate } from './ProjectCard';
import { toast } from './toast';

interface Props {
  project: ProjectMeta;
  onClose: () => void;
  /** Called after a version is restored (the open editor must reload). */
  onRestored?: () => void;
}

export function ProjectDetailsDialog({ project, onClose, onRestored }: Props) {
  const [tab, setTab] = useState<'info' | 'versions' | 'history'>('info');
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [category, setCategory] = useState<ProjectCategory>(project.category);
  const [tags, setTags] = useState(project.tags.join(', '));
  const [label, setLabel] = useState('');
  const versions = useLiveQuery(() => listVersions(project.id), [project.id]);
  const history = useLiveQuery(() => getHistory(project.id), [project.id]);
  const size = useLiveQuery(() => estimateProjectSize(project.id), [project.id]);
  const uid = useCloud((s) => s.user?.uid);
  const synced = useLiveQuery(async () => (uid ? !!(await db.syncState.get(`${uid}|project|${project.id}`)) : false), [uid, project.id]);

  const saveInfo = async () => {
    try {
      await updateProjectMeta(project.id, { name, description, category, tags: tags.split(',').map((t) => t.trim()).filter(Boolean) });
      toast.success('Informações salvas');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const tabBtn = (id: typeof tab, text: string) => (
    <button className={`border-b-2 px-3 py-2 text-sm ${tab === id ? 'border-accent-500 text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-100'}`} onClick={() => setTab(id)}>
      {text}
    </button>
  );

  return (
    <Modal open title={project.name} onClose={onClose} wide>
      <div className="-mt-2 mb-4 flex gap-1 border-b border-ink-800">
        {tabBtn('info', 'Informações')}
        {tabBtn('versions', 'Versões')}
        {tabBtn('history', 'Histórico')}
      </div>
      {tab === 'info' && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="pd-name">Nome</label>
            <input id="pd-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pd-desc">Descrição</label>
            <textarea id="pd-desc" className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="pd-cat">Categoria</label>
              <select id="pd-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value as ProjectCategory)}>
                {PROJECT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="pd-tags">Tags (separadas por vírgula)</label>
              <input id="pd-tags" className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-2 rounded-lg bg-ink-850 p-3 text-xs">
            <dt className="text-ink-400">Criado em</dt><dd>{fmtDate(project.createdAt)}</dd>
            <dt className="text-ink-400">Última modificação</dt><dd>{fmtDate(project.updatedAt)}</dd>
            <dt className="text-ink-400">Armazenamento</dt><dd>{synced ? 'Local + nuvem (Supabase)' : 'Local (IndexedDB neste dispositivo)'}</dd>
            <dt className="text-ink-400">Tamanho aproximado</dt><dd>{size === undefined ? '…' : formatBytes(size)}</dd>
          </dl>
          <div className="flex justify-end"><button className="btn-primary" onClick={saveInfo}>Salvar informações</button></div>
        </div>
      )}
      {tab === 'versions' && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input className="input" placeholder="Nome do ponto de restauração" value={label} onChange={(e) => setLabel(e.target.value)} />
            <button
              className="btn-primary shrink-0"
              onClick={async () => {
                await createVersion(project.id, label || 'Ponto de restauração');
                setLabel('');
                toast.success('Ponto de restauração criado');
              }}
            >
              Criar
            </button>
          </div>
          <p className="text-xs text-ink-400">Restaurar uma versão salva antes o estado atual como backup — nada é perdido.</p>
          <ul className="divide-y divide-ink-800 rounded-lg border border-ink-800">
            {versions?.length === 0 && <li className="p-3 text-sm text-ink-400">Nenhuma versão ainda.</li>}
            {versions?.map((v) => (
              <li key={v.id} className="flex items-center gap-2 p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{v.label} {v.auto && <span className="ml-1 rounded bg-ink-800 px-1.5 text-[10px] text-ink-400">auto</span>}</div>
                  <div className="text-xs text-ink-400">{fmtDate(v.createdAt)} · {formatBytes(v.size)}</div>
                </div>
                <button
                  className="btn-outline"
                  onClick={async () => {
                    if (!confirm(`Restaurar "${v.label}"? O estado atual será salvo como backup.`)) return;
                    try {
                      await restoreVersion(v.id);
                      toast.success('Versão restaurada');
                      onRestored?.();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Restaurar
                </button>
                <button className="icon-btn" aria-label="Excluir versão" onClick={() => confirm('Excluir esta versão?') && deleteVersion(v.id)}>🗑</button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === 'history' && (
        <ul className="space-y-1 text-sm">
          {history?.length === 0 && <li className="text-ink-400">Sem registros.</li>}
          {history?.map((h) => (
            <li key={h.id} className="flex gap-3"><span className="w-32 shrink-0 text-xs text-ink-400">{fmtDate(h.at)}</span>{h.action}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject } from '@/core/projects/projectService';
import { PROJECT_CATEGORIES, type ProjectCategory } from '@/core/projects/types';
import { TEMPLATES, defaultModulesFor } from '@/templates/templates';
import { Modal } from './Modal';
import { toast } from './toast';

interface Props {
  open: boolean;
  onClose: () => void;
  initialTemplate?: string;
}

export function NewProjectDialog({ open, onClose, initialTemplate }: Props) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProjectCategory>('web');
  const [template, setTemplate] = useState<string>(initialTemplate ?? '');
  const [busy, setBusy] = useState(false);

  const tpl = TEMPLATES.find((t) => t.id === template);

  const submit = async () => {
    setBusy(true);
    try {
      const meta = await createProject({
        name: name || tpl?.name || 'Novo projeto',
        description,
        category: tpl?.category ?? category,
        modules: tpl ? tpl.build() : defaultModulesFor(category),
      });
      toast.success(`Projeto "${meta.name}" criado`);
      onClose();
      navigate(`/project/${meta.id}`);
    } catch (e) {
      toast.error(`Não foi possível criar o projeto: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Novo projeto"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={submit} disabled={busy}>{busy ? 'Criando…' : 'Criar projeto'}</button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="np-name">Nome</label>
            <input id="np-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tpl?.name ?? 'Meu projeto'} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="np-desc">Descrição</label>
            <textarea id="np-desc" className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="np-cat">Categoria</label>
            <select id="np-cat" className="input" value={tpl?.category ?? category} disabled={!!tpl} onChange={(e) => setCategory(e.target.value as ProjectCategory)}>
              {PROJECT_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            {category === 'game' && !tpl && (
              <p className="mt-1.5 text-xs text-amber-300/90">
                O editor dedicado desta categoria chega em uma fase posterior. O projeto já pode ser criado, organizado e usar o editor de interfaces.
              </p>
            )}
          </div>
        </div>
        <div>
          <span className="label">Modelo inicial</span>
          <div className="space-y-2">
            <button onClick={() => setTemplate('')} className={`w-full rounded-lg border p-3 text-left text-sm ${template === '' ? 'border-accent-500 bg-accent-500/10' : 'border-ink-700 hover:bg-ink-800'}`}>
              <div className="font-medium">Em branco</div>
              <div className="text-xs text-ink-400">Começa conforme a categoria escolhida.</div>
            </button>
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => setTemplate(t.id)} className={`w-full rounded-lg border p-3 text-left text-sm ${template === t.id ? 'border-accent-500 bg-accent-500/10' : 'border-ink-700 hover:bg-ink-800'}`}>
                <div className="font-medium">{t.name}</div>
                <div className="text-xs text-ink-400">{t.description}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

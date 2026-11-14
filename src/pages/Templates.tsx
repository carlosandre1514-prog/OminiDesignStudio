import { useState } from 'react';
import { TEMPLATES } from '@/templates/templates';
import { NewProjectDialog } from '@/ui/NewProjectDialog';
import { categoryLabel } from '@/ui/ProjectCard';

export default function Templates() {
  const [tpl, setTpl] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Modelos</h1>
      <p className="text-sm text-ink-400">Pontos de partida editáveis. Cada modelo cria um projeto novo e independente.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TEMPLATES.map((t) => (
          <div key={t.id} className="panel flex flex-col p-4">
            <div className="text-xs text-ink-400">{categoryLabel(t.category)}</div>
            <div className="mt-1 font-medium">{t.name}</div>
            <p className="mt-1 flex-1 text-sm text-ink-400">{t.description}</p>
            <button className="btn-primary mt-4" onClick={() => setTpl(t.id)}>Usar modelo</button>
          </div>
        ))}
      </div>
      {tpl && <NewProjectDialog open initialTemplate={tpl} onClose={() => setTpl(null)} />}
    </div>
  );
}

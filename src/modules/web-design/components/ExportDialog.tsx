import { useMemo, useState } from 'react';
import { downloadBlob, downloadText } from '@/core/utils/download';
import { slugify } from '@/core/utils/sanitize';
import { Modal } from '@/ui/Modal';
import { toast } from '@/ui/toast';
import { exportHtmlProject } from '../export/html';
import { exportReactProject } from '../export/react';
import { zipFiles } from '../export/zip';
import type { WebDesignDoc } from '../model';

type Format = 'html' | 'react' | 'react-tailwind';

export function ExportDialog({ doc, projectName, onClose }: { doc: WebDesignDoc; projectName: string; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('html');
  const files = useMemo(
    () => (format === 'html' ? exportHtmlProject(doc) : exportReactProject(doc, { tailwind: format === 'react-tailwind' }, projectName)),
    [doc, format, projectName],
  );
  const names = Object.keys(files);
  const [file, setFile] = useState<string>('');
  const current = files[file] !== undefined ? file : names[0];
  const base = slugify(projectName, 'projeto');

  const zip = async () => {
    try {
      const blob = await zipFiles(files, `${base}-${format}`);
      downloadBlob(blob, `${base}-${format}.zip`);
      toast.success('Exportação ZIP gerada');
    } catch (e) {
      toast.error(`Falha ao gerar ZIP: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <Modal
      open
      wide
      title="Exportar código"
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={() => downloadText(files[current], current.split('/').pop()!)}>Baixar arquivo atual</button>
          <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(files[current]).then(() => toast.success('Copiado'))}>Copiar</button>
          <button className="btn-primary" onClick={zip}>Baixar projeto (.zip)</button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {([
          ['html', 'HTML + CSS'],
          ['react', 'React + TypeScript'],
          ['react-tailwind', 'React + TypeScript + Tailwind'],
        ] as [Format, string][]).map(([id, label]) => (
          <button key={id} onClick={() => { setFormat(id); setFile(''); }} className={`rounded-md border px-3 py-1.5 text-sm ${format === id ? 'border-accent-500 bg-accent-500/10' : 'border-ink-700 hover:bg-ink-800'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex min-h-[50vh] flex-col gap-3 sm:flex-row">
        <ul className="shrink-0 space-y-0.5 text-xs sm:w-52">
          {names.map((n) => (
            <li key={n}>
              <button className={`w-full truncate rounded px-2 py-1 text-left ${n === current ? 'bg-ink-800 text-ink-100' : 'text-ink-400 hover:bg-ink-850'}`} onClick={() => setFile(n)}>{n}</button>
            </li>
          ))}
        </ul>
        <pre className="max-h-[55vh] min-w-0 flex-1 overflow-auto rounded-md bg-ink-950 p-3 text-[11px] leading-relaxed text-ink-300">{files[current]}</pre>
      </div>
      <p className="mt-2 text-xs text-ink-400">
        {format === 'html'
          ? 'Uma página HTML por tela, folha de estilos compartilhada e script de interações (navegação, mostrar/ocultar, links).'
          : 'Projeto Vite pronto: npm install && npm run dev. Cada tela é um componente; o App controla navegação e estados.'}
      </p>
    </Modal>
  );
}

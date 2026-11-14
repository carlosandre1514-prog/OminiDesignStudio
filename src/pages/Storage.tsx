import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '@/core/db/database';
import { estimateProjectSize, exportProject, listProjects } from '@/core/projects/projectService';
import { downloadBlob, formatBytes } from '@/core/utils/download';
import { toast } from '@/ui/toast';

interface Estimate {
  usage: number;
  quota: number;
}

export default function Storage() {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const rows = useLiveQuery(async () => {
    const projects = await listProjects();
    return Promise.all(projects.map(async (p) => ({ p, size: await estimateProjectSize(p.id), versions: await db.versions.where('projectId').equals(p.id).count() })));
  }, []);

  const refresh = async () => {
    if (navigator.storage?.estimate) {
      const e = await navigator.storage.estimate();
      setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 });
    }
    if (navigator.storage?.persisted) setPersisted(await navigator.storage.persisted());
  };
  useEffect(() => void refresh(), []);

  const backupAll = async () => {
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      const projects = await listProjects();
      for (const p of projects) zip.file(`${p.id}.omni`, JSON.stringify(await exportProject(p.id)));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
      downloadBlob(blob, `omnidesign-backup-${new Date().toISOString().slice(0, 10)}.zip`);
      toast.success(`Backup de ${projects.length} projeto(s) gerado`);
    } catch (e) {
      toast.error(`Falha no backup: ${e instanceof Error ? e.message : e}`);
    }
  };

  const pruneAutoVersions = async () => {
    if (!confirm('Excluir todas as versões automáticas de todos os projetos? Pontos de restauração manuais são mantidos.')) return;
    const autos = (await db.versions.toArray()).filter((v) => v.auto);
    await db.versions.bulkDelete(autos.map((v) => v.id));
    toast.success(`${autos.length} versão(ões) automática(s) removida(s)`);
    void refresh();
  };

  const total = rows?.reduce((s, r) => s + r.size, 0) ?? 0;
  const pctUsed = estimate && estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Armazenamento</h1>
      <section className="panel space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Armazenamento local do navegador</h2>
          <button className="btn-ghost" onClick={refresh}>Atualizar</button>
        </div>
        {estimate ? (
          <>
            <div className="h-2 overflow-hidden rounded bg-ink-800"><div className="h-full bg-accent-500" style={{ width: `${Math.min(100, pctUsed)}%` }} /></div>
            <p className="text-sm text-ink-300">{formatBytes(estimate.usage)} usados de {formatBytes(estimate.quota)} disponíveis ({pctUsed.toFixed(2)}%)</p>
          </>
        ) : (
          <p className="text-sm text-ink-400">Este navegador não informa a cota de armazenamento.</p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-ink-300">Armazenamento persistente: {persisted === null ? 'não suportado' : persisted ? 'ativo' : 'não ativo'}</span>
          {persisted === false && (
            <button
              className="btn-outline"
              onClick={async () => {
                const ok = await navigator.storage.persist();
                setPersisted(ok);
                if (ok) toast.success('Armazenamento persistente ativado');
                else toast.info('O navegador recusou o pedido (ele decide com base no uso do site).');
              }}
            >
              Solicitar persistência
            </button>
          )}
        </div>
        <p className="text-xs text-ink-400">Com persistência ativa, o navegador não apaga os dados do OmniDesign automaticamente quando há pouco espaço.</p>
      </section>

      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Projetos ({formatBytes(total)} aprox.)</h2>
          <div className="flex gap-2">
            <button className="btn-outline" onClick={pruneAutoVersions}>Limpar versões automáticas</button>
            <button className="btn-primary" onClick={backupAll}>Backup completo (.zip)</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-400">
            <tr><th className="py-2">Projeto</th><th>Versões</th><th className="text-right">Tamanho</th></tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {rows?.map(({ p, size, versions }) => (
              <tr key={p.id}><td className="py-2">{p.name}</td><td>{versions}</td><td className="text-right">{formatBytes(size)}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

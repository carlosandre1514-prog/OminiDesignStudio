import { useSettings, type AppSettings } from '@/core/settings/settings';
import { toast } from '@/ui/toast';

function NumberField({ k, label, min, max, step = 1, hint }: { k: keyof AppSettings; label: string; min: number; max: number; step?: number; hint?: string }) {
  const { settings, update } = useSettings();
  return (
    <div>
      <label className="label" htmlFor={`set-${k}`}>{label}</label>
      <input id={`set-${k}`} type="number" className="input max-w-40" min={min} max={max} step={step} value={Number(settings[k])} onChange={(e) => update({ [k]: Number(e.target.value) } as Partial<AppSettings>)} />
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}

function Toggle({ k, label }: { k: keyof AppSettings; label: string }) {
  const { settings, update } = useSettings();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={Boolean(settings[k])} onChange={(e) => update({ [k]: e.target.checked } as Partial<AppSettings>)} />
      {label}
    </label>
  );
}

export default function Settings() {
  const reset = useSettings((s) => s.reset);
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
      <section className="panel space-y-4 p-5">
        <h2 className="font-medium">Salvamento e versões</h2>
        <NumberField k="autosaveDelayMs" label="Atraso do salvamento automático (ms)" min={200} max={10000} step={100} hint="Tempo de inatividade após uma alteração antes de gravar no armazenamento local." />
        <NumberField k="autoVersionMinutes" label="Ponto de restauração automático a cada (minutos)" min={0} max={240} hint="0 desativa. Mantém as 20 versões automáticas mais recentes por projeto. Vale ao abrir o próximo projeto." />
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="font-medium">Importação</h2>
        <NumberField k="maxImportSizeMB" label="Tamanho máximo de importação (MB)" min={1} max={2048} />
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="font-medium">Canvas (novos projetos)</h2>
        <NumberField k="defaultGridSize" label="Tamanho do grid (px)" min={2} max={128} />
        <Toggle k="showGridByDefault" label="Mostrar grid" />
        <Toggle k="snapToGridByDefault" label="Ajustar ao grid" />
      </section>
      <section className="panel space-y-4 p-5">
        <h2 className="font-medium">Acessibilidade</h2>
        <Toggle k="reduceMotion" label="Reduzir animações e transições" />
      </section>
      <button className="btn-outline" onClick={async () => { await reset(); toast.success('Configurações restauradas'); }}>Restaurar padrões</button>
    </div>
  );
}

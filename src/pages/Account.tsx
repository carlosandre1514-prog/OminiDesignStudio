import { useState, type FormEvent } from 'react';
import { validateCloudConfig } from '@/core/cloud/config';
import { useCloud, type CloudStatus } from '@/core/cloud/cloudStore';
import { KIND_LABEL, type SyncConflict } from '@/core/cloud/types';
import { toast } from '@/ui/toast';

const STATUS_TEXT: Record<CloudStatus, string> = {
  loading: 'Carregando…',
  unconfigured: 'Nuvem não configurada',
  'signed-out': 'Não conectado',
  'needs-consent': 'Aguardando sua confirmação',
  idle: 'Sincronizado',
  syncing: 'Sincronizando…',
  offline: 'Offline — alterações ficam pendentes',
  error: 'Erro na última sincronização',
};

const REASON_TEXT: Record<SyncConflict['reason'], string> = {
  'both-modified': 'Alterado neste dispositivo e em outro ao mesmo tempo',
  'local-deleted': 'Excluído aqui, mas alterado em outro dispositivo',
  'remote-deleted': 'Alterado aqui, mas excluído em outro dispositivo',
  'both-created': 'Criado com o mesmo identificador em dois lugares',
};

function ConnectForm() {
  const connect = useCloud((s) => s.connect);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs = validateCloudConfig(url, key);
    setErrors(errs);
    if (errs.length) return;
    setBusy(true);
    try {
      await connect(url, key);
      toast.success('Supabase configurado');
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel space-y-4 p-5">
      <h2 className="font-medium">Conectar ao Supabase</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-300">
        <li>Crie um projeto em <strong>supabase.com</strong>.</li>
        <li>No <strong>SQL Editor</strong>, execute o script <code>supabase/migrations/0001_omnidesign_sync.sql</code> deste repositório (cria a tabela, as regras de acesso e o bucket de arquivos).</li>
        <li>Em <strong>Authentication → URL Configuration</strong>, adicione o endereço deste app nas URLs de redirecionamento (para confirmação de e-mail e redefinição de senha).</li>
        <li>Em <strong>Project Settings → API</strong>, copie a <strong>Project URL</strong> e a chave <strong>anon / publishable</strong> e cole abaixo.</li>
      </ol>
      <p className="text-xs text-ink-400">Passo a passo completo em <code>docs/CLOUD_SETUP.md</code>.</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="sb-url">Project URL</label>
          <input id="sb-url" className="input" placeholder="https://seu-projeto.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="sb-key">Chave pública (anon / publishable)</label>
          <input id="sb-key" className="input font-mono text-xs" placeholder="eyJhbGciOi… ou sb_publishable_…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" />
        </div>
        {errors.length > 0 && <ul className="space-y-1 text-sm text-red-300" role="alert">{errors.map((e) => <li key={e}>• {e}</li>)}</ul>}
        <p className="text-xs text-ink-400">A chave pública é feita para ficar no navegador; a segurança vem das regras de acesso (RLS) do script. Chaves secretas (service_role / sb_secret) são recusadas.</p>
        <button className="btn-primary" disabled={busy || !url.trim() || !key.trim()}>{busy ? 'Conectando…' : 'Salvar configuração'}</button>
      </form>
    </section>
  );
}

function NewPasswordForm() {
  const updatePassword = useCloud((s) => s.updatePassword);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setError('Use pelo menos 8 caracteres.');
    if (pw !== pw2) return setError('As senhas não coincidem.');
    try {
      await updatePassword(pw);
      toast.success('Senha alterada');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <section className="panel max-w-md space-y-3 border-accent-500/50 p-5">
      <h2 className="font-medium">Definir nova senha</h2>
      <form onSubmit={submit} className="space-y-3">
        <input type="password" className="input" aria-label="Nova senha" placeholder="Nova senha" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" className="input" aria-label="Confirmar nova senha" placeholder="Confirmar nova senha" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
        <button className="btn-primary">Salvar nova senha</button>
      </form>
    </section>
  );
}

function AuthForms() {
  const { signIn, signUp, resetPassword } = useCloud.getState();
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'up' && password !== confirm) return setError('As senhas não coincidem.');
    if (mode === 'up' && password.length < 8) return setError('Use uma senha com pelo menos 8 caracteres.');
    setBusy(true);
    try {
      if (mode === 'in') await signIn(email, password);
      if (mode === 'up') {
        const needsConfirmation = await signUp(email, password);
        if (needsConfirmation) {
          toast.success('Conta criada. Confirme o e-mail pelo link enviado e depois entre.');
          setMode('in');
        } else toast.success('Conta criada.');
      }
      if (mode === 'reset') {
        await resetPassword(email);
        toast.success('Se houver uma conta com este e-mail, você receberá um link para redefinir a senha.');
        setMode('in');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const tab = (id: typeof mode, label: string) => (
    <button type="button" onClick={() => { setMode(id); setError(null); }} className={`border-b-2 px-3 py-2 text-sm ${mode === id ? 'border-accent-500 text-ink-100' : 'border-transparent text-ink-400 hover:text-ink-100'}`}>
      {label}
    </button>
  );

  return (
    <section className="panel max-w-md p-5">
      <div className="mb-4 flex gap-1 border-b border-ink-800">
        {tab('in', 'Entrar')}
        {tab('up', 'Criar conta')}
        {tab('reset', 'Esqueci a senha')}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="acc-email">E-mail</label>
          <input id="acc-email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== 'reset' && (
          <div>
            <label className="label" htmlFor="acc-pass">Senha</label>
            <input id="acc-pass" type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} required className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {mode === 'up' && (
          <div>
            <label className="label" htmlFor="acc-pass2">Confirmar senha</label>
            <input id="acc-pass2" type="password" autoComplete="new-password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
        )}
        {error && <p className="text-sm text-red-300" role="alert">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? 'Aguarde…' : mode === 'in' ? 'Entrar' : mode === 'up' ? 'Criar conta' : 'Enviar link de redefinição'}
        </button>
      </form>
    </section>
  );
}

function Conflicts() {
  const conflicts = useCloud((s) => s.conflicts);
  const resolve = useCloud((s) => s.resolve);
  const [busy, setBusy] = useState<string | null>(null);
  if (!conflicts.length) return null;
  const run = async (key: string, choice: 'local' | 'remote' | 'both') => {
    setBusy(key);
    try {
      await resolve(key, choice);
      toast.success('Conflito resolvido');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="panel space-y-3 border-amber-500/40 p-5">
      <h2 className="font-medium text-amber-200">Conflitos ({conflicts.length})</h2>
      <p className="text-sm text-ink-300">Nada foi sobrescrito. Escolha qual versão manter em cada item — ao manter a da nuvem, a versão deste dispositivo de um projeto é guardada como ponto de restauração.</p>
      <ul className="divide-y divide-ink-800">
        {conflicts.map((c) => (
          <li key={c.key} className="space-y-2 py-3">
            <div className="text-sm">
              <span className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-ink-300">{KIND_LABEL[c.kind]}</span>{' '}
              <strong>{c.localName}</strong>
              {c.remoteName !== c.localName && <span className="text-ink-400"> · na nuvem: {c.remoteName}</span>}
            </div>
            <div className="text-xs text-ink-400">{REASON_TEXT[c.reason]}{c.remoteUpdatedAt ? ` · nuvem alterada em ${new Date(c.remoteUpdatedAt).toLocaleString('pt-BR')}` : ''}</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-outline text-xs" disabled={busy === c.key} onClick={() => run(c.key, 'local')}>Manter deste dispositivo</button>
              <button className="btn-outline text-xs" disabled={busy === c.key} onClick={() => run(c.key, 'remote')}>Manter da nuvem</button>
              {c.kind === 'project' && c.reason !== 'local-deleted' && (
                <button className="btn-outline text-xs" disabled={busy === c.key} onClick={() => run(c.key, 'both')}>Manter ambos</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SignedIn() {
  const s = useCloud();
  const r = s.lastReport;
  return (
    <>
      <section className="panel flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink-400">Conectado como</div>
          <div className="truncate font-medium">{s.user?.email}</div>
          {!s.user?.emailVerified && (
            <div className="mt-1 text-xs text-amber-300">
              E-mail ainda não confirmado.{' '}
              <button className="underline" onClick={() => s.resendVerification().then(() => toast.success('E-mail de confirmação reenviado'))}>Reenviar</button>
            </div>
          )}
        </div>
        <button className="btn-outline" onClick={() => s.signOut().then(() => toast.info('Você saiu. Os dados continuam salvos neste dispositivo.'))}>Sair</button>
      </section>

      {s.status === 'needs-consent' && (
        <section className="panel space-y-3 border-accent-500/50 p-5">
          <h2 className="font-medium">Primeira sincronização desta conta neste dispositivo</h2>
          <p className="text-sm text-ink-300">
            Há <strong>{s.consentCount}</strong> item(ns) salvos neste dispositivo que ainda não estão nesta conta. Ao continuar, eles serão enviados para a nuvem de <strong>{s.user?.email}</strong> e mesclados com o que já existe lá.
          </p>
          <div className="flex gap-2">
            <button className="btn-primary" onClick={() => s.allowUpload()}>Enviar e sincronizar</button>
            <button className="btn-ghost" onClick={() => s.signOut()}>Agora não (sair)</button>
          </div>
        </section>
      )}

      <section className="panel space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-medium">Sincronização</h2>
            <p className="text-sm text-ink-300" data-testid="sync-status">{STATUS_TEXT[s.status]}</p>
          </div>
          <button className="btn-primary" disabled={s.status === 'syncing' || s.status === 'needs-consent'} onClick={() => s.syncNow().then((rep) => rep && !rep.errors.length && toast.success('Sincronização concluída'))}>
            {s.status === 'syncing' ? 'Sincronizando…' : 'Sincronizar agora'}
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-ink-850 p-3 text-xs sm:grid-cols-4">
          <div><dt className="text-ink-400">Última sincronização</dt><dd>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleString('pt-BR') : '—'}</dd></div>
          <div><dt className="text-ink-400">Alterações locais pendentes</dt><dd data-testid="sync-pending">{s.pending}</dd></div>
          <div><dt className="text-ink-400">Conflitos</dt><dd>{s.conflicts.length}</dd></div>
          <div><dt className="text-ink-400">Último resultado</dt><dd data-testid="sync-report">{r ? `${r.pushed} enviados · ${r.pulled} recebidos · ${r.deletedLocal + r.deletedRemote} exclusões` : '—'}</dd></div>
        </dl>
        {s.lastError && <p className="text-sm text-red-300">{s.lastError}</p>}
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.prefs.autoSync} onChange={(e) => s.setPrefs({ autoSync: e.target.checked })} /> Sincronizar automaticamente
          </label>
          <label className="flex items-center gap-2">
            a cada
            <input type="number" min={1} max={120} className="input w-20 py-1" value={s.prefs.intervalMinutes} onChange={(e) => s.setPrefs({ intervalMinutes: Number(e.target.value) || 1 })} />
            min (e logo após alterações, ao voltar online e ao reabrir o app)
          </label>
        </div>
      </section>
      <Conflicts />
    </>
  );
}

export default function Account() {
  const status = useCloud((s) => s.status);
  const config = useCloud((s) => s.config);
  const disconnect = useCloud((s) => s.disconnect);
  const recovery = useCloud((s) => s.recovery);
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conta e nuvem</h1>
        <p className="mt-1 text-sm text-ink-400">
          O OmniDesign funciona 100% offline. Com uma conta, seus projetos, assets, pastas e versões são sincronizados entre dispositivos pelo Supabase.
        </p>
      </div>
      {status === 'loading' && <p className="text-sm text-ink-400">Carregando…</p>}
      {status === 'unconfigured' && <ConnectForm />}
      {recovery && <NewPasswordForm />}
      {config && status === 'signed-out' && <AuthForms />}
      {config && !['loading', 'unconfigured', 'signed-out'].includes(status) && <SignedIn />}
      {config && (
        <section className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
          <span>
            Supabase: <code>{new URL(config.url).host}</code> · configurado {config.source === 'env' ? 'no build' : 'neste dispositivo'}
          </span>
          {config.source === 'settings' && (
            <button className="underline hover:text-ink-100" onClick={() => confirm('Desconectar este dispositivo do Supabase? Os dados locais são mantidos.') && disconnect()}>
              Desconectar do Supabase
            </button>
          )}
        </section>
      )}
    </div>
  );
}

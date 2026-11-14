import { create } from 'zustand';
import { db } from '@/core/db/database';
import { debounce } from '@/core/utils/debounce';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { getSupabase, resetSupabase } from './client';
import {
  clearCloudConfig,
  DEFAULT_PREFS,
  deviceId,
  grantConsent,
  hasConsent,
  loadCloudConfig,
  loadPrefs,
  saveCloudConfig,
  savePrefs,
  type CloudConfig,
  type SyncPrefs,
} from './config';
import { countPending, resolveConflict, syncAll, type ConflictChoice, type SyncContext } from './engine';
import { notifyPulled, runBeforeSync } from './hooks';
import { createAdapters } from './kinds';
import type { SyncConflict, SyncReport } from './types';

export type CloudStatus = 'loading' | 'unconfigured' | 'signed-out' | 'needs-consent' | 'idle' | 'syncing' | 'offline' | 'error';

export interface CloudUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

interface CloudState {
  status: CloudStatus;
  config: CloudConfig | null;
  user: CloudUser | null;
  prefs: SyncPrefs;
  lastSyncAt: number | null;
  lastReport: SyncReport | null;
  lastError: string | null;
  pending: number;
  /** Local items that would be uploaded on first sync with this account (consent prompt). */
  consentCount: number;
  conflicts: SyncConflict[];
  /** Opened from a password-reset e-mail: the user must choose a new password. */
  recovery: boolean;

  init(): Promise<void>;
  connect(url: string, anonKey: string): Promise<void>;
  disconnect(): Promise<void>;
  /** Returns true when the project requires e-mail confirmation before the first login. */
  signUp(email: string, password: string): Promise<boolean>;
  updatePassword(password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  allowUpload(): Promise<void>;
  syncNow(): Promise<SyncReport | null>;
  resolve(key: string, choice: ConflictChoice): Promise<void>;
  refreshCounts(): Promise<void>;
  setPrefs(p: Partial<SyncPrefs>): Promise<void>;
}

const AUTH_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail pelo link enviado antes de entrar.'],
  [/user already registered|already been registered/i, 'Já existe uma conta com este e-mail.'],
  [/password should be at least|weak.?password/i, 'Senha fraca: use pelo menos 8 caracteres, misturando letras e números.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'E-mail inválido.'],
  [/rate limit|too many requests/i, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'],
  [/signups? not allowed|signup is disabled/i, 'Novos cadastros estão desativados neste projeto Supabase.'],
  [/failed to fetch|network|fetch failed/i, 'Sem conexão com o Supabase. Verifique a internet e a URL configurada.'],
  [/invalid api key|no api key/i, 'Chave pública (anon) inválida na configuração.'],
  [/relation .*omni_records.* does not exist|could not find the table/i, 'As tabelas do OmniDesign não existem neste projeto. Execute o script supabase/migrations/0001_omnidesign_sync.sql.'],
  [/bucket not found/i, 'O bucket "omni-assets" não existe. Execute o script de configuração do Supabase.'],
];

export function authMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  for (const [re, text] of AUTH_ERRORS) if (re.test(msg)) return text;
  return msg;
}

let unsubAuth: (() => void) | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let listenersInstalled = false;
let applyingRemote = false;
let syncing: Promise<SyncReport | null> | null = null;

async function context(cfg: CloudConfig, uid: string): Promise<SyncContext> {
  const sb = await getSupabase(cfg);
  const { SupabaseRemote } = await import('./supabaseRemote');
  return {
    db,
    remote: new SupabaseRemote(sb, uid, await deviceId()),
    adapters: createAdapters(db),
    onPulled: notifyPulled,
  };
}

export const useCloud = create<CloudState>((set, get) => {
  const client = async (): Promise<SupabaseClient> => {
    const cfg = get().config;
    if (!cfg) throw new Error('Configure o Supabase primeiro.');
    return getSupabase(cfg);
  };

  const scheduleSoon = debounce(() => {
    const s = get();
    if (s.prefs.autoSync && s.status === 'idle') void s.syncNow();
  }, 8000);

  const refreshPendingSoon = debounce(() => void get().refreshCounts(), 1500);

  /** Local writes (outside a sync) mark work pending and trigger an automatic sync. */
  const installDbHooks = () => {
    for (const table of [db.projects, db.documents, db.versions, db.assets, db.folders]) {
      const onChange = () => {
        if (applyingRemote) return;
        refreshPendingSoon();
        scheduleSoon();
      };
      (table as unknown as { hook(ev: string, fn: () => void): void }).hook('creating', onChange);
      (table as unknown as { hook(ev: string, fn: () => void): void }).hook('updating', onChange);
      (table as unknown as { hook(ev: string, fn: () => void): void }).hook('deleting', onChange);
    }
  };

  const restartTimer = () => {
    if (timer) clearInterval(timer);
    timer = null;
    const s = get();
    if (!s.user || !s.prefs.autoSync) return;
    timer = setInterval(() => void get().syncNow(), s.prefs.intervalMinutes * 60_000);
  };

  const afterSignIn = async (user: CloudUser) => {
    set({ user });
    if (!(await hasConsent(user.uid))) {
      const n = await countPending(db, createAdapters(db), user.uid);
      if (n > 0) {
        set({ status: 'needs-consent', consentCount: n });
        return;
      }
      await grantConsent(user.uid);
    }
    set({ status: navigator.onLine ? 'idle' : 'offline' });
    restartTimer();
    void get().syncNow();
  };

  return {
    status: 'loading',
    config: null,
    user: null,
    prefs: DEFAULT_PREFS,
    lastSyncAt: null,
    lastReport: null,
    lastError: null,
    pending: 0,
    consentCount: 0,
    conflicts: [],
    recovery: false,

    async init() {
      const [config, prefs] = await Promise.all([loadCloudConfig(), loadPrefs()]);
      set({ config, prefs });
      if (!listenersInstalled) {
        listenersInstalled = true;
        installDbHooks();
        window.addEventListener('online', () => {
          if (get().status === 'offline') set({ status: 'idle' });
          void get().syncNow();
        });
        window.addEventListener('offline', () => {
          if (get().user && get().status !== 'needs-consent') set({ status: 'offline' });
        });
        document.addEventListener('visibilitychange', () => {
          const s = get();
          if (document.visibilityState === 'visible' && s.prefs.autoSync && (!s.lastSyncAt || Date.now() - s.lastSyncAt > 30_000)) void s.syncNow();
        });
      }
      if (!config) {
        set({ status: 'unconfigured' });
        return;
      }
      try {
        const sb = await getSupabase(config);
        unsubAuth?.();
        const onUser = (u: User | null | undefined) => {
          if (u) {
            const user: CloudUser = { uid: u.id, email: u.email ?? null, emailVerified: !!u.email_confirmed_at };
            const cur = get().user;
            // Token refreshes re-emit the same user: only (re)start the session when it changes.
            if (cur?.uid === user.uid && get().status !== 'signed-out') set({ user });
            else void afterSignIn(user);
          } else {
            if (timer) clearInterval(timer);
            set({ user: null, status: 'signed-out', conflicts: [], pending: 0 });
          }
        };
        const { data } = sb.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
          // Defer: supabase-js recommends not awaiting other auth calls inside this callback.
          setTimeout(() => onUser(session?.user), 0);
        });
        unsubAuth = () => data.subscription.unsubscribe();
        const { data: s0, error } = await sb.auth.getSession();
        if (error) throw error;
        if (!s0.session) set({ status: 'signed-out' });
      } catch (e) {
        set({ status: 'error', lastError: `Falha ao iniciar o Supabase: ${authMessage(e)}` });
      }
    },

    async connect(url, anonKey) {
      await saveCloudConfig(url, anonKey);
      unsubAuth?.();
      unsubAuth = null;
      resetSupabase();
      set({ status: 'loading', lastError: null });
      await get().init();
    },

    async disconnect() {
      await get().signOut().catch(() => undefined);
      unsubAuth?.();
      unsubAuth = null;
      resetSupabase();
      await clearCloudConfig();
      set({ config: null, user: null, status: 'unconfigured' });
      await get().init();
    },

    async signUp(email, password) {
      const sb = await client();
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${location.origin}/account` } });
      if (error) throw new Error(authMessage(error));
      return !data.session;
    },

    async signIn(email, password) {
      const sb = await client();
      const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(authMessage(error));
    },

    async signOut() {
      if (!get().config) return;
      await syncing?.catch(() => undefined);
      const sb = await client();
      // Local scope: only this device signs out; local data stays on the device.
      const { error } = await sb.auth.signOut({ scope: 'local' });
      if (error) throw new Error(authMessage(error));
    },

    async resetPassword(email) {
      const sb = await client();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/account` });
      if (error) throw new Error(authMessage(error));
    },

    async updatePassword(password) {
      const sb = await client();
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(authMessage(error));
      set({ recovery: false });
    },

    async resendVerification() {
      const email = get().user?.email;
      if (!email) return;
      const sb = await client();
      const { error } = await sb.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${location.origin}/account` } });
      if (error) throw new Error(authMessage(error));
    },

    async allowUpload() {
      const u = get().user;
      if (!u) return;
      await grantConsent(u.uid);
      set({ status: 'idle', consentCount: 0 });
      restartTimer();
      await get().syncNow();
    },

    async syncNow() {
      if (syncing) return syncing;
      const { config, user, status } = get();
      if (!config || !user || status === 'needs-consent') return null;
      if (!navigator.onLine) {
        set({ status: 'offline' });
        return null;
      }
      syncing = (async () => {
        set({ status: 'syncing', lastError: null });
        try {
          await runBeforeSync();
          const ctx = await context(config, user.uid);
          applyingRemote = true;
          let report: SyncReport;
          try {
            report = await syncAll(ctx);
          } finally {
            applyingRemote = false;
          }
          set({
            status: report.errors.length ? 'error' : 'idle',
            lastSyncAt: Date.now(),
            lastReport: report,
            lastError: report.errors.length ? report.errors.slice(0, 3).join(' · ') : null,
          });
          await get().refreshCounts();
          return report;
        } catch (e) {
          set({ status: navigator.onLine ? 'error' : 'offline', lastError: authMessage(e) });
          return null;
        } finally {
          syncing = null;
        }
      })();
      return syncing;
    },

    async resolve(key, choice) {
      const { config, user } = get();
      if (!config || !user) return;
      const ctx = await context(config, user.uid);
      applyingRemote = true;
      try {
        await resolveConflict(ctx, key, choice);
      } finally {
        applyingRemote = false;
      }
      await get().refreshCounts();
      void get().syncNow();
    },

    async refreshCounts() {
      const u = get().user;
      if (!u) return;
      const [pending, conflicts] = await Promise.all([
        countPending(db, createAdapters(db), u.uid),
        db.syncConflicts.where('owner').equals(u.uid).toArray(),
      ]);
      set({ pending, conflicts });
    },

    async setPrefs(p) {
      const prefs = { ...get().prefs, ...p };
      prefs.intervalMinutes = Math.min(120, Math.max(1, Math.round(prefs.intervalMinutes)));
      await savePrefs(prefs);
      set({ prefs });
      restartTimer();
    },
  };
});

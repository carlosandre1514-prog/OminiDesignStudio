import { db } from '@/core/db/database';

export interface CloudConfig {
  /** Supabase project URL, e.g. https://xyzcompany.supabase.co */
  url: string;
  /** Public key (anon / publishable). Never a service_role / secret key. */
  anonKey: string;
  source: 'env' | 'settings';
}

export interface SyncPrefs {
  autoSync: boolean;
  intervalMinutes: number;
}

const CONFIG_KEY = 'cloud-config';
const PREFS_KEY = 'cloud-prefs';
const CONSENT_KEY = 'cloud-consented-owners';

export const DEFAULT_PREFS: SyncPrefs = { autoSync: true, intervalMinutes: 2 };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

/** Validate a config. Secret keys are rejected so they are never stored in the browser. */
export function validateCloudConfig(url: string, anonKey: string): string[] {
  const errors: string[] = [];
  let u: URL | null = null;
  try {
    u = new URL(url.trim());
  } catch {
    errors.push('URL inválida');
  }
  if (u && u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)))
    errors.push('A URL deve usar https:// (http só é aceito para localhost)');
  const key = anonKey.trim();
  if (!key) errors.push('Informe a chave pública (anon / publishable)');
  else if (/^sb_secret_/.test(key)) errors.push('Esta é uma chave secreta. Use a chave pública (anon / publishable) — nunca a secreta no navegador.');
  else {
    const payload = decodeJwtPayload(key);
    if (payload?.role === 'service_role') errors.push('Esta é a chave service_role (secreta). Use a chave "anon" — nunca a service_role no navegador.');
    else if (!payload && !/^sb_publishable_/.test(key)) errors.push('Formato de chave não reconhecido (esperado a chave "anon" (JWT) ou "sb_publishable_…")');
  }
  return errors;
}

export async function loadCloudConfig(): Promise<CloudConfig | null> {
  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (envUrl && envKey && !validateCloudConfig(envUrl, envKey).length) return { url: envUrl.replace(/\/+$/, ''), anonKey: envKey, source: 'env' };
  const v = (await db.settings.get(CONFIG_KEY))?.value as { url?: string; anonKey?: string } | undefined;
  if (v?.url && v.anonKey && !validateCloudConfig(v.url, v.anonKey).length) return { url: v.url, anonKey: v.anonKey, source: 'settings' };
  return null;
}

export async function saveCloudConfig(url: string, anonKey: string): Promise<void> {
  const errors = validateCloudConfig(url, anonKey);
  if (errors.length) throw new Error(errors.join('; '));
  await db.settings.put({ key: CONFIG_KEY, value: { url: url.trim().replace(/\/+$/, ''), anonKey: anonKey.trim() } });
}

export async function clearCloudConfig(): Promise<void> {
  await db.settings.delete(CONFIG_KEY);
}

export async function loadPrefs(): Promise<SyncPrefs> {
  const v = (await db.settings.get(PREFS_KEY))?.value as Partial<SyncPrefs> | undefined;
  return {
    autoSync: typeof v?.autoSync === 'boolean' ? v.autoSync : DEFAULT_PREFS.autoSync,
    intervalMinutes: Math.min(120, Math.max(1, Number(v?.intervalMinutes) || DEFAULT_PREFS.intervalMinutes)),
  };
}

export async function savePrefs(p: SyncPrefs): Promise<void> {
  await db.settings.put({ key: PREFS_KEY, value: p });
}

/** Accounts that this device was explicitly allowed to upload its local data to. */
export async function hasConsent(owner: string): Promise<boolean> {
  const v = (await db.settings.get(CONSENT_KEY))?.value;
  return Array.isArray(v) && v.includes(owner);
}

export async function grantConsent(owner: string): Promise<void> {
  const v = (await db.settings.get(CONSENT_KEY))?.value;
  const list = Array.isArray(v) ? v : [];
  if (!list.includes(owner)) await db.settings.put({ key: CONSENT_KEY, value: [...list, owner] });
}

export async function deviceId(): Promise<string> {
  const rec = await db.settings.get('device-id');
  if (typeof rec?.value === 'string') return rec.value;
  const id = `dev_${crypto.getRandomValues(new Uint32Array(2)).join('')}`;
  await db.settings.put({ key: 'device-id', value: id });
  return id;
}

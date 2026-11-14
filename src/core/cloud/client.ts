import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudConfig } from './config';

let current: { client: SupabaseClient; key: string } | null = null;

/** Lazily loads supabase-js (separate chunk) and creates one client per config. */
export async function getSupabase(cfg: CloudConfig): Promise<SupabaseClient> {
  const key = `${cfg.url}|${cfg.anonKey}`;
  if (current?.key === key) return current.client;
  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'omnidesign-auth' },
  });
  current = { client, key };
  return client;
}

export function resetSupabase(): void {
  current = null;
}

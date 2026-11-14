import type { OmniDatabase } from '@/core/db/database';
import { createId } from '@/core/utils/id';
import { hashPayload, type KindAdapter, type ProjectPayload } from './kinds';
import { KIND_LABEL, SYNC_KINDS, type ConflictReason, type RemoteHead, type RemoteStore, type SyncConflict, type SyncKind, type SyncReport, type SyncStateRecord } from './types';

export interface SyncContext {
  db: OmniDatabase;
  remote: RemoteStore;
  adapters: Record<SyncKind, KindAdapter>;
  /** Called after a record was created/updated/deleted locally because of the cloud. */
  onPulled?: (kind: SyncKind, id: string, deleted: boolean) => void;
}

const stateKey = (owner: string, kind: SyncKind, id: string) => `${owner}|${kind}|${id}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function setState(ctx: SyncContext, kind: SyncKind, id: string, revision: number, hash: string) {
  const owner = ctx.remote.owner;
  const rec: SyncStateRecord = { key: stateKey(owner, kind, id), owner, kind, id, revision, hash };
  await ctx.db.syncState.put(rec);
}

async function dropState(ctx: SyncContext, kind: SyncKind, id: string) {
  await ctx.db.syncState.delete(stateKey(ctx.remote.owner, kind, id));
}

async function recordConflict(ctx: SyncContext, kind: SyncKind, id: string, reason: ConflictReason, localPayload: unknown | null, head: RemoteHead | undefined) {
  const remote = head && !head.deleted ? await ctx.remote.get(kind, id) : null;
  const a = ctx.adapters[kind];
  const c: SyncConflict = {
    key: stateKey(ctx.remote.owner, kind, id),
    owner: ctx.remote.owner,
    kind,
    recordId: id,
    reason,
    localName: localPayload ? a.nameOf(localPayload) : '(excluído neste dispositivo)',
    remoteName: remote ? a.nameOf(remote.payload) : '(excluído na nuvem)',
    remoteRevision: head?.revision ?? 0,
    remoteUpdatedAt: head?.updatedAt ?? '',
    detectedAt: Date.now(),
  };
  await ctx.db.syncConflicts.put(c);
}

/** Download a record and store it locally; the agreed hash is what the local copy looks like afterwards. */
async function pull(ctx: SyncContext, kind: SyncKind, id: string): Promise<boolean> {
  const rec = await ctx.remote.get(kind, id);
  const a = ctx.adapters[kind];
  if (!rec || rec.deleted) {
    await a.remove(id);
    await dropState(ctx, kind, id);
    ctx.onPulled?.(kind, id, true);
    return false;
  }
  await a.write(id, rec.payload, ctx.remote);
  const local = await a.read(id);
  await setState(ctx, kind, id, rec.revision, local ? await hashPayload(local) : rec.hash);
  ctx.onPulled?.(kind, id, false);
  return true;
}

async function pushInsert(ctx: SyncContext, kind: SyncKind, id: string, payload: unknown, hash: string, report: SyncReport) {
  const a = ctx.adapters[kind];
  await a.beforePush?.(id, payload, ctx.remote);
  const res = await ctx.remote.insert(kind, id, { hash, payload, deleted: false });
  if (res === 'ok') {
    await setState(ctx, kind, id, 1, hash);
    report.pushed++;
    return;
  }
  // The id already exists remotely (created elsewhere meanwhile).
  const heads = await ctx.remote.list(kind);
  const head = heads.find((h) => h.id === id);
  if (head && !head.deleted && head.hash === hash) await setState(ctx, kind, id, head.revision, hash);
  else if (head?.deleted) {
    // A stale tombstone with the same id: revive it with the local content.
    if ((await ctx.remote.update(kind, id, head.revision, { hash, payload, deleted: false })) === 'ok') {
      await setState(ctx, kind, id, head.revision + 1, hash);
      report.pushed++;
    } else {
      await recordConflict(ctx, kind, id, 'both-created', payload, head);
      report.conflicts++;
    }
  } else {
    await recordConflict(ctx, kind, id, 'both-created', payload, head);
    report.conflicts++;
  }
}

async function syncRecord(
  ctx: SyncContext,
  kind: SyncKind,
  id: string,
  R: RemoteHead | undefined,
  S: SyncStateRecord | undefined,
  hasLocal: boolean,
  conflict: SyncConflict | undefined,
  report: SyncReport,
) {
  const a = ctx.adapters[kind];
  const payload = hasLocal ? await a.read(id) : null;
  const L = payload !== null;
  const hash = L ? await hashPayload(payload) : null;

  if (conflict) {
    // A pending conflict blocks the record until the user decides — unless both sides converged.
    if (L && R && !R.deleted && hash === R.hash) {
      await setState(ctx, kind, id, R.revision, hash!);
      await ctx.db.syncConflicts.delete(conflict.key);
    } else if (!L && (!R || R.deleted)) {
      await dropState(ctx, kind, id);
      await ctx.db.syncConflicts.delete(conflict.key);
    } else report.conflicts++;
    return;
  }

  if (!S) {
    if (!R) {
      if (L) await pushInsert(ctx, kind, id, payload, hash!, report);
      return;
    }
    if (R.deleted) {
      if (L) await pushInsert(ctx, kind, id, payload, hash!, report); // revives the tombstone
      return;
    }
    if (!L) {
      if (await pull(ctx, kind, id)) report.pulled++;
      return;
    }
    if (hash === R.hash) await setState(ctx, kind, id, R.revision, hash!);
    else {
      await recordConflict(ctx, kind, id, 'both-created', payload, R);
      report.conflicts++;
    }
    return;
  }

  if (!R) {
    // The remote row vanished (removed in the dashboard, for example): upload again if we still have it.
    if (L) await pushInsert(ctx, kind, id, payload, hash!, report);
    else await dropState(ctx, kind, id);
    return;
  }

  if (!L) {
    // Deleted on this device.
    if (R.deleted) await dropState(ctx, kind, id);
    else if (R.revision === S.revision) {
      if ((await ctx.remote.update(kind, id, S.revision, { hash: S.hash, payload: null, deleted: true })) === 'ok') {
        await dropState(ctx, kind, id);
        report.deletedRemote++;
      } else {
        await recordConflict(ctx, kind, id, 'local-deleted', null, R);
        report.conflicts++;
      }
    } else {
      await recordConflict(ctx, kind, id, 'local-deleted', null, R);
      report.conflicts++;
    }
    return;
  }

  const localChanged = hash !== S.hash;
  const remoteChanged = R.revision !== S.revision;

  if (R.deleted) {
    if (!localChanged) {
      await a.remove(id);
      await dropState(ctx, kind, id);
      ctx.onPulled?.(kind, id, true);
      report.deletedLocal++;
    } else {
      await recordConflict(ctx, kind, id, 'remote-deleted', payload, R);
      report.conflicts++;
    }
    return;
  }

  if (!localChanged && !remoteChanged) return;
  if (localChanged && !remoteChanged) {
    if ((await ctx.remote.update(kind, id, S.revision, { hash: hash!, payload, deleted: false })) === 'ok') {
      await setState(ctx, kind, id, S.revision + 1, hash!);
      report.pushed++;
    } else {
      // Someone else wrote first.
      await recordConflict(ctx, kind, id, 'both-modified', payload, (await ctx.remote.list(kind)).find((h) => h.id === id) ?? R);
      report.conflicts++;
    }
    return;
  }
  if (!localChanged && remoteChanged) {
    if (await pull(ctx, kind, id)) report.pulled++;
    else report.deletedLocal++;
    return;
  }
  if (hash === R.hash) await setState(ctx, kind, id, R.revision, hash!);
  else {
    await recordConflict(ctx, kind, id, 'both-modified', payload, R);
    report.conflicts++;
  }
}

/**
 * Full sync: for every record kind, compare local, last agreed state and cloud,
 * push local changes, pull remote ones and record conflicts (never overwriting silently).
 */
export async function syncAll(ctx: SyncContext, kinds: SyncKind[] = SYNC_KINDS): Promise<SyncReport> {
  const report: SyncReport = { pushed: 0, pulled: 0, deletedLocal: 0, deletedRemote: 0, conflicts: 0, errors: [], startedAt: Date.now(), finishedAt: 0 };
  const owner = ctx.remote.owner;
  for (const kind of kinds) {
    const a = ctx.adapters[kind];
    let heads: RemoteHead[];
    try {
      heads = await ctx.remote.list(kind);
    } catch (e) {
      report.errors.push(`Falha ao listar ${KIND_LABEL[kind].toLowerCase()}s na nuvem: ${errMsg(e)}`);
      continue;
    }
    const remote = new Map(heads.map((h) => [h.id, h]));
    const states = new Map((await ctx.db.syncState.where('[owner+kind]').equals([owner, kind]).toArray()).map((s) => [s.id, s]));
    const conflicts = new Map((await ctx.db.syncConflicts.where('owner').equals(owner).toArray()).filter((c) => c.kind === kind).map((c) => [c.recordId, c]));
    const local = new Set(await a.listIds());
    const ids = new Set([...local, ...remote.keys(), ...states.keys()]);
    for (const id of ids) {
      try {
        await syncRecord(ctx, kind, id, remote.get(id), states.get(id), local.has(id), conflicts.get(id), report);
      } catch (e) {
        report.errors.push(`${KIND_LABEL[kind]} ${id}: ${errMsg(e)}`);
      }
    }
  }
  report.finishedAt = Date.now();
  return report;
}

/** Local changes not yet in the cloud (new, modified or deleted records) for an account. */
export async function countPending(db: OmniDatabase, adapters: Record<SyncKind, KindAdapter>, owner: string): Promise<number> {
  let n = 0;
  for (const kind of SYNC_KINDS) {
    const states = new Map((await db.syncState.where('[owner+kind]').equals([owner, kind]).toArray()).map((s) => [s.id, s]));
    const ids = await adapters[kind].listIds();
    for (const id of ids) {
      const s = states.get(id);
      if (!s) n++;
      else {
        const p = await adapters[kind].read(id);
        if (p && (await hashPayload(p)) !== s.hash) n++;
      }
      states.delete(id);
    }
    n += states.size; // deleted locally, not yet propagated
  }
  return n;
}

export type ConflictChoice = 'local' | 'remote' | 'both';

/** Resolve a conflict explicitly. Nothing is lost: "remote" keeps a local backup version for projects; "both" keeps a copy. */
export async function resolveConflict(ctx: SyncContext, key: string, choice: ConflictChoice): Promise<void> {
  const c = await ctx.db.syncConflicts.get(key);
  if (!c) return;
  const { kind, recordId: id } = c;
  const a = ctx.adapters[kind];
  const remote = await ctx.remote.get(kind, id);
  const local = await a.read(id);

  if (choice === 'local') {
    if (local) {
      const hash = await hashPayload(local);
      if (!remote) {
        await a.beforePush?.(id, local, ctx.remote);
        if ((await ctx.remote.insert(kind, id, { hash, payload: local, deleted: false })) !== 'ok') throw new Error('A nuvem mudou novamente. Sincronize e tente de novo.');
        await setState(ctx, kind, id, 1, hash);
      } else {
        if (remote.deleted) await a.beforePush?.(id, local, ctx.remote);
        if ((await ctx.remote.update(kind, id, remote.revision, { hash, payload: local, deleted: false })) !== 'ok')
          throw new Error('A nuvem mudou novamente. Sincronize e tente de novo.');
        await setState(ctx, kind, id, remote.revision + 1, hash);
      }
    } else {
      if (remote && !remote.deleted && (await ctx.remote.update(kind, id, remote.revision, { hash: remote.hash, payload: null, deleted: true })) !== 'ok')
        throw new Error('A nuvem mudou novamente. Sincronize e tente de novo.');
      await dropState(ctx, kind, id);
    }
  } else {
    if (choice === 'both') {
      if (kind !== 'project' || !local) throw new Error('"Manter ambos" está disponível apenas para projetos existentes nos dois lados.');
      await duplicateLocalProject(ctx.db, id, local as ProjectPayload);
    } else if (kind === 'project' && local) {
      // Safety net: keep the local content as a restore point before taking the cloud version.
      await ctx.db.versions.add({
        id: createId('ver'),
        projectId: id,
        label: `Cópia local antes de resolver conflito (${new Date().toLocaleString('pt-BR')})`,
        createdAt: Date.now(),
        auto: false,
        snapshot: JSON.stringify((local as ProjectPayload).modules),
        size: JSON.stringify((local as ProjectPayload).modules).length,
      });
    }
    if (remote && !remote.deleted) {
      await a.write(id, remote.payload, ctx.remote);
      const after = await a.read(id);
      await setState(ctx, kind, id, remote.revision, after ? await hashPayload(after) : remote.hash);
      ctx.onPulled?.(kind, id, false);
    } else {
      if (choice === 'remote') await a.remove(id);
      await dropState(ctx, kind, id);
      if (choice === 'remote') ctx.onPulled?.(kind, id, true);
    }
  }
  await ctx.db.syncConflicts.delete(key);
}

async function duplicateLocalProject(db: OmniDatabase, id: string, local: ProjectPayload) {
  const newId = createId('prj');
  const now = Date.now();
  await db.transaction('rw', db.projects, db.documents, db.history, async () => {
    await db.projects.add({ ...local.meta, id: newId, name: `${local.meta.name} (cópia local)`, updatedAt: now, createdAt: now });
    await db.documents.add({ projectId: newId, modules: structuredClone(local.modules), updatedAt: now });
    await db.history.add({ projectId: newId, at: now, action: `Cópia local criada ao resolver conflito de sincronização (${id})` });
  });
}

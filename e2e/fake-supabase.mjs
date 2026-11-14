// Local stand-in for the parts of the Supabase HTTP API used by OmniDesign (GoTrue auth,
// PostgREST on "omni_records", Storage on "omni-assets"), enforcing the same rules as
// supabase/migrations/0001_omnidesign_sync.sql: owner isolation (RLS), revision + 1, no hard delete,
// content-addressed immutable files. Used only by the browser E2E tests.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fakeJwt = (claims) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.sig`;
export const ANON_KEY = fakeJwt({ role: 'anon', iss: 'fake-supabase' });

export function startFakeSupabase(port = 54399) {
  const users = new Map(); // email -> { id, email, password }
  const tokens = new Map(); // access/refresh token -> user id
  const rows = new Map(); // `${owner}|${kind}|${id}` -> row
  const files = new Map(); // path -> { body, type }
  let requests = 0;

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
      'Access-Control-Expose-Headers': '*',
      ...(body !== undefined && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    });
    res.end(body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readBody = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
    });
  const userFor = (req) => {
    const t = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const id = tokens.get(t);
    return id ? [...users.values()].find((u) => u.id === id) : undefined;
  };
  const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() });
  const session = (u) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const access = fakeJwt({ sub: u.id, role: 'authenticated', email: u.email, exp, aud: 'authenticated' }) + randomUUID().slice(0, 6);
    const refresh = randomUUID();
    tokens.set(access, u.id);
    tokens.set(refresh, u.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: refresh, user: userJson(u) };
  };
  const filters = (url) => {
    const f = {};
    for (const [k, v] of url.searchParams) if (['owner', 'kind', 'id', 'revision'].includes(k) && v.startsWith('eq.')) f[k] = decodeURIComponent(v.slice(3));
    return f;
  };
  const matches = (row, f) => Object.entries(f).every(([k, v]) => String(row[k]) === v);
  const HASH = /^[0-9a-f]{64}$/;

  const server = createServer(async (req, res) => {
    requests++;
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = url.pathname;
    const raw = await readBody(req);
    const json = () => (raw.length ? JSON.parse(raw.toString()) : {});

    // ---------------- Auth (GoTrue) ----------------
    if (p === '/auth/v1/signup' && req.method === 'POST') {
      const { email, password } = json();
      if (!/^[^@\s]+@[^@\s]+$/.test(email ?? '')) return send(res, 400, { code: 400, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
      if ((password ?? '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      if (users.has(email)) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
      const u = { id: randomUUID(), email, password };
      users.set(email, u);
      return send(res, 200, session(u));
    }
    if (p === '/auth/v1/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      const body = json();
      if (grant === 'password') {
        const u = users.get(body.email);
        if (!u || u.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return send(res, 200, session(u));
      }
      if (grant === 'refresh_token') {
        const id = tokens.get(body.refresh_token);
        const u = [...users.values()].find((x) => x.id === id);
        if (!u) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
        return send(res, 200, session(u));
      }
    }
    if (p === '/auth/v1/user' && req.method === 'GET') {
      const u = userFor(req);
      return u ? send(res, 200, userJson(u)) : send(res, 401, { code: 401, msg: 'invalid JWT' });
    }
    if (p === '/auth/v1/logout') return send(res, 204);
    if (p === '/auth/v1/recover') return send(res, 200, {});

    // ---------------- REST (PostgREST) ----------------
    if (p === '/rest/v1/omni_records') {
      const u = userFor(req);
      if (!u) return send(res, 401, { code: '42501', message: 'permission denied for table omni_records' });
      const f = filters(url);
      if (req.method === 'GET') {
        let list = [...rows.values()].filter((r) => r.owner === u.id && matches(r, f)); // RLS
        list.sort((a, b) => a.id.localeCompare(b.id));
        const offset = Number(url.searchParams.get('offset') ?? 0);
        const limit = Number(url.searchParams.get('limit') ?? 1e9);
        list = list.slice(offset, offset + limit);
        return send(res, 200, list);
      }
      if (req.method === 'POST') {
        const body = json();
        const owner = body.owner ?? u.id;
        if (owner !== u.id) return send(res, 403, { code: '42501', message: 'new row violates row-level security policy' });
        if (body.revision !== 1) return send(res, 400, { code: '40001', message: 'novos registros começam na revisão 1' });
        if (!HASH.test(body.hash ?? '')) return send(res, 400, { code: '23514', message: 'check constraint violation (hash)' });
        const key = `${owner}|${body.kind}|${body.id}`;
        if (rows.has(key)) return send(res, 409, { code: '23505', message: 'duplicate key value violates unique constraint' });
        rows.set(key, { owner, kind: body.kind, id: body.id, revision: 1, hash: body.hash, payload: body.payload ?? null, payload_ref: body.payload_ref ?? null, deleted: !!body.deleted, device: body.device ?? null, updated_at: new Date().toISOString() });
        return send(res, 201, []);
      }
      if (req.method === 'PATCH') {
        const body = json();
        const targets = [...rows.entries()].filter(([, r]) => r.owner === u.id && matches(r, f));
        for (const [, r] of targets) {
          if (body.revision !== r.revision + 1) return send(res, 400, { code: '40001', message: 'omni_records: conflito de revisão' });
        }
        const out = [];
        for (const [k, r] of targets) {
          const next = { ...r, ...body, owner: r.owner, kind: r.kind, id: r.id, updated_at: new Date().toISOString() };
          rows.set(k, next);
          out.push(next);
        }
        return send(res, 200, (req.headers.prefer ?? '').includes('return=representation') ? out : []);
      }
      if (req.method === 'DELETE') return send(res, 403, { code: '42501', message: 'permission denied for table omni_records' });
    }

    // ---------------- Storage ----------------
    const m = /^\/storage\/v1\/object\/(?:authenticated\/)?omni-assets\/(.+)$/.exec(p);
    if (m) {
      const u = userFor(req);
      const path = decodeURIComponent(m[1]);
      const ownPath = u && new RegExp(`^${u.id}/(blobs/[0-9a-f]{64}|payloads/[0-9a-f]{64}\\.json)$`).test(path);
      if (req.method === 'POST' || req.method === 'PUT') {
        if (!ownPath) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        if (files.has(path)) return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        files.set(path, { body: raw, type: req.headers['content-type'] ?? 'application/octet-stream' });
        return send(res, 200, { Key: `omni-assets/${path}`, Id: randomUUID() });
      }
      if (req.method === 'GET') {
        const file = u && path.startsWith(`${u.id}/`) ? files.get(path) : undefined;
        if (!file) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        return send(res, 200, file.body, { 'Content-Type': file.type });
      }
    }
    send(res, 404, { message: `Rota não implementada no servidor de teste: ${req.method} ${p}` });
  });

  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${port}`,
        anonKey: ANON_KEY,
        stats: () => ({ users: users.size, rows: rows.size, files: files.size, requests }),
        close: () => new Promise((r) => server.close(r)),
      }),
    ),
  );
}

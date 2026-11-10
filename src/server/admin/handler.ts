import { ADMIN_ASSETS } from '../../generated/admin-assets.js';
import { getConfig, MIN_ADMIN_TOKEN_LENGTH, type DossierConfig } from '../config.js';
import { getDb, type Db } from '../db.js';
import { clientIp, HttpError, json, logError, readJson, text, type Handler, type RequestContext } from '../http.js';
import { createLink, deleteLink, updateLink } from '../links.js';
import { assertSchemaReady, SchemaNotReadyError } from '../migrations.js';
import { deleteVisitors, getSettings, pruneExpired, updateSettings } from '../retention.js';
import { RateLimiter, readCookie, safeEqual, SESSION_COOKIE, SESSION_TTL_SECONDS, signSession, verifySession } from '../security.js';
import * as api from './api.js';

export type AdminOptions = {
  db?: Db;
  /** Demo mode: no login, a banner, and seeded data. Only the CLI turns this on. */
  demo?: boolean;
};

const loginLimiter = new RateLimiter(10, 15 * 60_000);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // rrweb-player and replayed pages rely on inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Replays load images and fonts from the recorded site.
  'img-src * data: blob:',
  'font-src * data:',
  "connect-src 'self'",
  "frame-src 'self' about: blob:",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const PAGE_HEADERS = {
  'content-security-policy': CSP,
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'cache-control': 'no-store',
  'x-robots-tag': 'noindex, nofollow',
};

function page(demo: boolean): Response {
  const v = (name: string) => ADMIN_ASSETS[name]?.hash ?? '0';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light dark">
<title>Dossier</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='5' y='3' width='22' height='26' rx='3' fill='%23c2410c'/%3E%3Crect x='10' y='10' width='12' height='2.5' rx='1' fill='white'/%3E%3Crect x='10' y='15.5' width='12' height='2.5' rx='1' fill='white'/%3E%3Crect x='10' y='21' width='7' height='2.5' rx='1' fill='white'/%3E%3C/svg%3E">
<link rel="stylesheet" href="?asset=app.css&v=${v('app.css')}">
</head>
<body${demo ? ' data-demo="1"' : ''}>
<div id="app"></div>
<script type="module" src="?asset=app.js&v=${v('app.js')}"></script>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { ...PAGE_HEADERS, 'content-type': 'text/html; charset=utf-8' } });
}

function asset(name: string): Response {
  const a = ADMIN_ASSETS[name];
  if (!a) return text('Not found', 404);
  return new Response(a.body, {
    status: 200,
    headers: {
      'content-type': a.type,
      'cache-control': 'private, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}

function isHttps(req: Request): boolean {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

function sessionCookie(req: Request, value: string, maxAge: number): string {
  const path = new URL(req.url).pathname;
  return [
    `${SESSION_COOKIE}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    isHttps(req) ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

type Auth = { ok: true } | { ok: false; response: Response };

function authenticate(req: Request, config: DossierConfig, demo: boolean): Auth {
  if (demo) return { ok: true };
  const token = config.adminToken;
  if (!token) return { ok: false, response: json({ error: 'not_configured' }, { status: 503 }) };
  if (token.length < MIN_ADMIN_TOKEN_LENGTH) return { ok: false, response: json({ error: 'weak_token' }, { status: 503 }) };
  const bearer = req.headers.get('authorization');
  if (bearer?.toLowerCase().startsWith('bearer ') && safeEqual(bearer.slice(7).trim(), token)) return { ok: true };
  if (verifySession(token, readCookie(req, SESSION_COOKIE))) return { ok: true };
  return { ok: false, response: json({ error: 'unauthorized' }, { status: 401 }) };
}

/** Same-origin check for state-changing requests (defense in depth on top of SameSite=Strict). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  try {
    return new URL(origin).host === (req.headers.get('host') ?? new URL(req.url).host);
  } catch {
    return false;
  }
}

function q(url: URL, name: string): string | null {
  const v = url.searchParams.get(name);
  return v && v.length <= 200 ? v : null;
}

function days(url: URL, fallback = 90): number {
  const n = Number(url.searchParams.get('days'));
  return Number.isFinite(n) && n > 0 ? Math.min(3650, Math.trunc(n)) : fallback;
}

function strArray(v: unknown, max = 100): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length <= 128).slice(0, max) : [];
}

export function createAdminHandler(options: AdminOptions = {}): Handler {
  const demo = options.demo === true;
  return async (req: Request, ctx?: RequestContext) => {
    const url = new URL(req.url, 'http://localhost');
    const assetName = url.searchParams.get('asset');
    if (assetName) return asset(assetName);
    const route = url.searchParams.get('api');
    if (!route) return req.method === 'GET' ? page(demo) : text('Method not allowed', 405);

    const config = getConfig();
    const db = options.db ?? getDb();

    try {
      if (route === 'status') {
        const auth = authenticate(req, config, demo);
        return json({
          demo,
          authed: auth.ok,
          db_configured: Boolean(db),
          token_configured: Boolean(config.adminToken),
          token_too_short: Boolean(config.adminToken && config.adminToken.length < MIN_ADMIN_TOKEN_LENGTH),
        });
      }

      if (route === 'login') {
        if (req.method !== 'POST' || !sameOrigin(req)) return text('Forbidden', 403);
        if (!loginLimiter.take(clientIp(req, ctx) ?? 'unknown')) return json({ error: 'too_many_attempts' }, { status: 429 });
        const token = config.adminToken;
        if (!token || token.length < MIN_ADMIN_TOKEN_LENGTH) return json({ error: 'not_configured' }, { status: 503 });
        const body = (await readJson(req, 4096)) as { token?: unknown };
        if (typeof body.token !== 'string' || !safeEqual(body.token, token)) {
          return json({ error: 'invalid_token' }, { status: 401 });
        }
        return json({ ok: true }, { headers: { 'set-cookie': sessionCookie(req, signSession(token), SESSION_TTL_SECONDS) } });
      }

      if (route === 'logout') {
        if (req.method !== 'POST') return text('Method not allowed', 405);
        return json({ ok: true }, { headers: { 'set-cookie': sessionCookie(req, '', 0) } });
      }

      const auth = authenticate(req, config, demo);
      if (!auth.ok) return auth.response;
      if (!db) return json({ error: 'no_database' }, { status: 503 });
      await assertSchemaReady(db);

      if (req.method === 'GET') {
        const includeBots = url.searchParams.get('bots') === '1';
        switch (route) {
          case 'overview':
            return json(await api.overview(db, config, { days: days(url), includeBots }));
          case 'person': {
            const id = q(url, 'id');
            if (!id) return json({ error: 'missing id' }, { status: 400 });
            const data = await api.person(db, config, id, days(url, 3650));
            return data ? json(data) : json({ error: 'not_found' }, { status: 404 });
          }
          case 'session': {
            const sid = q(url, 'sid');
            if (!sid) return json({ error: 'missing sid' }, { status: 400 });
            const data = await api.session(db, sid);
            return data ? json(data) : json({ error: 'not_found' }, { status: 404 });
          }
          case 'replay': {
            const sid = q(url, 'sid');
            if (!sid) return json({ error: 'missing sid' }, { status: 400 });
            const from = Number(url.searchParams.get('from') ?? 0);
            return json(await api.replay(db, sid, Number.isFinite(from) ? from : 0));
          }
          case 'map':
            return json(await api.map(db, config, { days: days(url, 365), includeBots }));
          case 'bots':
            return json(await api.bots(db, days(url, 30)));
          case 'content':
            return json(await api.content(db, days(url, 30)));
          case 'settings':
            return json(await api.settings(db, config));
          default:
            return json({ error: 'unknown route' }, { status: 404 });
        }
      }

      if (req.method !== 'POST') return text('Method not allowed', 405);
      if (!sameOrigin(req)) return text('Forbidden', 403);
      if (demo && ['delete', 'prune', 'settings'].includes(route)) {
        return json({ error: 'Disabled in demo mode' }, { status: 403 });
      }
      const body = (await readJson(req, 16_384)) as Record<string, unknown>;
      switch (route) {
        case 'links':
          try {
            return json({ link: await createLink(db, body) });
          } catch (err) {
            return json({ error: err instanceof Error ? err.message : 'invalid link' }, { status: 400 });
          }
        case 'link': {
          const id = typeof body.id === 'string' ? body.id : null;
          if (!id) return json({ error: 'missing id' }, { status: 400 });
          if (body.delete === true) await deleteLink(db, id);
          else await updateLink(db, id, body);
          return json({ ok: true });
        }
        case 'label': {
          const vids = strArray(body.vids);
          const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) || null : null;
          await db.query(`UPDATE visitors SET label = $2 WHERE vid = ANY($1::text[])`, [vids, label]);
          return json({ ok: true });
        }
        case 'mark': {
          const vids = strArray(body.vids);
          const isBot = typeof body.is_bot === 'boolean' ? body.is_bot : null;
          await db.query(`UPDATE visitors SET bot_override = $2 WHERE vid = ANY($1::text[])`, [vids, isBot]);
          if (isBot != null) await db.query(`UPDATE sessions SET is_bot = $2 WHERE vid = ANY($1::text[])`, [vids, isBot]);
          return json({ ok: true });
        }
        case 'delete':
          return json(await deleteVisitors(db, strArray(body.vids)));
        case 'prune':
          return json(await pruneExpired(db, await getSettings(db), 5000));
        case 'settings':
          return json({ settings: await updateSettings(db, body) });
        default:
          return json({ error: 'unknown route' }, { status: 404 });
      }
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, { status: err.status });
      if (err instanceof SchemaNotReadyError) return json({ error: 'schema', message: err.message }, { status: 503 });
      logError(`admin:${route}`, err);
      return json({ error: 'internal_error' }, { status: 500 });
    }
  };
}

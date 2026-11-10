import { CLIENT_ASSETS } from '../generated/client-assets.js';
import { computeBotScore } from './bot.js';
import { getConfig, type DossierConfig } from './config.js';
import { getDb, type Db } from './db.js';
import { lookupIp, lookupPtr, type IpDetails } from './enrich.js';
import {
  clientIp,
  empty,
  hostFromUrl,
  HttpError,
  logError,
  readJson,
  text,
  type Handler,
  type RequestContext,
} from './http.js';
import { buildIdentityEdges, upsertIdentityEdges } from './identity.js';
import { resolveLinkId } from './links.js';
import { assertSchemaReady, SchemaNotReadyError } from './migrations.js';
import { makeDisplayName } from './names.js';
import { getSettings, pruneExpired } from './retention.js';
import { RateLimiter } from './security.js';
import { LEGACY_PAGEVIEW, rollupPageViews, type PageViewRow, type PageViewSummary } from './rollup.js';
import { parseUserAgent } from './ua.js';
import { LIMITS, parseCollect, parseReplay, type CollectInput } from './validate.js';

export type CollectOptions = {
  /** Use this database instead of DATABASE_URL. */
  db?: Db;
};

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** Decide whether a browser request may post events, and which origin to echo for CORS. */
export function checkOrigin(
  req: Request,
  config: Pick<DossierConfig, 'allowedHosts' | 'allowLocalhost'>,
): { allowed: boolean; corsOrigin: string | null } {
  const host = (req.headers.get('host') ?? hostFromUrl(req.url) ?? '').toLowerCase();
  const origin = req.headers.get('origin');
  const originHost = hostFromUrl(origin);
  const sourceHost = originHost ?? hostFromUrl(req.headers.get('referer'));
  const fetchSite = req.headers.get('sec-fetch-site');

  const listed = (h: string) =>
    h === host || config.allowedHosts.includes(h) || (config.allowLocalhost && LOCAL_HOST_RE.test(h));

  if (sourceHost) {
    const ok = listed(sourceHost);
    // Only echo an Origin for genuinely cross-origin callers; same-origin needs no CORS headers.
    return { allowed: ok, corsOrigin: ok && origin && originHost !== host ? origin : null };
  }
  // No Origin/Referer: allow only when the browser vouches it is same-origin.
  return { allowed: fetchSite === 'same-origin', corsOrigin: null };
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function serveAsset(name: string): Response {
  const asset = CLIENT_ASSETS[name];
  if (!asset) return text('Not found', 404);
  const versioned = name !== 'tracker.js';
  return new Response(asset.body, {
    status: 200,
    headers: {
      'content-type': asset.type,
      'cache-control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'x-content-type-options': 'nosniff',
      'cross-origin-resource-policy': 'cross-origin',
    },
  });
}

function vercelGeo(req: Request) {
  const h = (name: string) => {
    const v = req.headers.get(name);
    if (!v) return null;
    try {
      return decodeURIComponent(v.replace(/\+/g, '%20'));
    } catch {
      return v;
    }
  };
  const lat = Number(h('x-vercel-ip-latitude'));
  const lon = Number(h('x-vercel-ip-longitude'));
  const country = h('x-vercel-ip-country');
  if (!country) return null;
  return {
    city: h('x-vercel-ip-city'),
    region: h('x-vercel-ip-country-region'),
    country,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    source: 'vercel',
  };
}

const limiter = new RateLimiter(120, 60_000);

/**
 * The collector. One endpoint does three jobs:
 *   GET               -> the tracker script (`?asset=recorder|fingerprint` for lazy chunks)
 *   POST              -> analytics events and session summaries
 *   POST ?kind=replay -> session replay chunks
 */
export function createCollectHandler(options: CollectOptions = {}): Handler {
  return async (req: Request, ctx?: RequestContext) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = url.searchParams.get('asset');
      return serveAsset(asset ? `${asset}.js` : 'tracker.js');
    }

    const config = getConfig();
    const { allowed, corsOrigin } = checkOrigin(req, config);
    const cors = corsHeaders(corsOrigin);

    if (req.method === 'OPTIONS') return empty(allowed ? 204 : 403, cors);
    if (req.method !== 'POST') return text('Method not allowed', 405, { allow: 'GET, POST, OPTIONS' });
    if (!allowed) return text('Forbidden', 403, cors);

    const ip = clientIp(req, ctx);
    if (!limiter.take(ip ?? 'unknown')) return text('Too many requests', 429, cors);

    const db = options.db ?? getDb();
    if (!db) {
      logError('collect', new Error('DATABASE_URL is not set; dropping events'));
      return empty(204, cors);
    }

    try {
      await assertSchemaReady(db);
      const isReplay = url.searchParams.get('kind') === 'replay';
      const body = await readJson(req, isReplay ? LIMITS.replayBodyBytes : LIMITS.collectBodyBytes);
      const status = isReplay ? await ingestReplay(db, body, config) : await ingestEvents(db, req, body, ip, config);
      return empty(status, cors);
    } catch (err) {
      if (err instanceof HttpError) return text(err.message, err.status, cors);
      if (err instanceof SchemaNotReadyError) {
        logError('collect', err);
        return text('Dossier is not migrated yet', 503, cors);
      }
      logError('collect', err);
      // Never break the host site over analytics.
      return empty(204, cors);
    }
  };
}

async function ingestEvents(db: Db, req: Request, body: unknown, ip: string | null, config: DossierConfig): Promise<number> {
  const parsed = parseCollect(body);
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  const input = parsed.value;
  if (input.internal) return 204;

  const userAgent = (req.headers.get('user-agent') ?? '').slice(0, 500);
  const acceptLanguage = (req.headers.get('accept-language') ?? '').slice(0, 200);

  const existing = (
    await db.query<{ is_bot: boolean | null; ipinfo: Record<string, unknown> | null; event_count: number }>(
      `SELECT is_bot, ipinfo, event_count FROM sessions WHERE sid = $1`,
      [input.sid],
    )
  ).rows[0];

  let highVelocity = false;
  if (ip && !existing) {
    const { rows } = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM sessions WHERE ip = $1 AND started_at > NOW() - INTERVAL '60 seconds'`,
      [ip],
    );
    highVelocity = Number(rows[0]?.n ?? 0) >= 25;
  }

  const botBase = {
    userAgent,
    acceptLanguage,
    webdriver: input.client.webdriver,
    highVelocity,
    activeSeconds: input.summary?.activeSeconds ?? null,
    idleSeconds: input.summary?.idleSeconds ?? null,
    sessionSeconds: input.summary?.sessionSeconds ?? null,
    interactions: input.summary?.interactions ?? null,
  };
  const prelim = computeBotScore(botBase, config.botThreshold);

  // Enrich once per session. Skip third-party lookups for obvious bots to save quota.
  let details: IpDetails | null = null;
  let ptr: string | null = null;
  if (!existing && ip) {
    if (!prelim.isBot) details = await lookupIp(db, ip, config).catch(() => null);
    ptr = await lookupPtr(db, ip, config).catch(() => null);
  }
  const org = details?.org ?? (typeof existing?.ipinfo?.org === 'string' ? existing.ipinfo.org : null);
  const bot = computeBotScore({ ...botBase, org }, config.botThreshold);

  const geo = vercelGeo(req) ?? (details ? { ...details } : null);
  const device = { ...parseUserAgent(userAgent), screen: input.client.screen, tz: input.client.tz, lang: input.client.lang };
  const linkId = await resolveLinkId(db, input.refTag);
  const startedAt = input.events[0]?.ts ?? new Date();

  await db.query(
    `INSERT INTO visitors (vid, display_name, first_ip, last_ip, first_user_agent, last_user_agent,
                           first_referrer, last_referrer, first_ref_tag, last_ref_tag, first_fingerprint_id, last_fingerprint_id, ptr)
     VALUES ($1, $2, $3, $3, $4, $4, $5, $5, $6, $6, $7, $7, $8)
     ON CONFLICT (vid) DO UPDATE SET
       last_seen_at = NOW(),
       last_ip = COALESCE(EXCLUDED.last_ip, visitors.last_ip),
       last_user_agent = COALESCE(EXCLUDED.last_user_agent, visitors.last_user_agent),
       last_referrer = COALESCE(EXCLUDED.last_referrer, visitors.last_referrer),
       last_ref_tag = COALESCE(EXCLUDED.last_ref_tag, visitors.last_ref_tag),
       last_fingerprint_id = COALESCE(EXCLUDED.last_fingerprint_id, visitors.last_fingerprint_id),
       ptr = COALESCE(EXCLUDED.ptr, visitors.ptr)`,
    [input.vid, makeDisplayName(input.vid), ip, userAgent, input.referrer, input.refTag, input.fpid, ptr],
  );

  const { rows: sessionRows } = await db.query<{ is_bot: boolean; event_count: number }>(
    `INSERT INTO sessions (sid, vid, session_cookie_id, fingerprint_id, ref_tag, link_id, started_at, ip, ptr, user_agent,
                           accept_language, referrer, page, is_mobile, orientation, geo, ipinfo, device, bot_score, bot_reasons, is_bot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb, $18::jsonb, $19, $20,
             COALESCE((SELECT bot_override FROM visitors WHERE vid = $2), $21))
     ON CONFLICT (sid) DO UPDATE SET
       updated_at = NOW(),
       ref_tag = COALESCE(sessions.ref_tag, EXCLUDED.ref_tag),
       link_id = COALESCE(sessions.link_id, EXCLUDED.link_id),
       session_cookie_id = COALESCE(sessions.session_cookie_id, EXCLUDED.session_cookie_id),
       fingerprint_id = COALESCE(sessions.fingerprint_id, EXCLUDED.fingerprint_id),
       is_mobile = COALESCE(EXCLUDED.is_mobile, sessions.is_mobile),
       orientation = COALESCE(EXCLUDED.orientation, sessions.orientation),
       bot_score = GREATEST(COALESCE(sessions.bot_score, 0), EXCLUDED.bot_score),
       bot_reasons = CASE WHEN EXCLUDED.bot_score > COALESCE(sessions.bot_score, 0) THEN EXCLUDED.bot_reasons ELSE sessions.bot_reasons END,
       is_bot = COALESCE((SELECT bot_override FROM visitors WHERE vid = sessions.vid), COALESCE(sessions.is_bot, false) OR EXCLUDED.is_bot)
     RETURNING is_bot, event_count`,
    [
      input.sid,
      input.vid,
      input.scid,
      input.fpid,
      input.refTag,
      linkId,
      startedAt.toISOString(),
      ip,
      ptr,
      userAgent,
      acceptLanguage,
      input.referrer,
      input.page,
      input.isMobile,
      input.orientation,
      geo ? JSON.stringify(geo) : null,
      details ? JSON.stringify(details) : null,
      JSON.stringify(device),
      bot.score,
      bot.reasons.join(', '),
      bot.isBot,
    ],
  );
  const session = sessionRows[0]!;

  if (ip) {
    await db.query(
      `INSERT INTO session_ips (sid, ip) VALUES ($1, $2)
       ON CONFLICT (sid, ip) DO UPDATE SET last_seen_at = NOW(), hit_count = session_ips.hit_count + 1`,
      [input.sid, ip],
    );
  }

  if (!session.is_bot) {
    await upsertIdentityEdges(
      db,
      buildIdentityEdges({ vid: input.vid, scid: input.scid, fpid: input.fpid, ip, userAgent }),
    );
  }

  await insertEvents(db, input, Number(session.event_count ?? 0), config.maxEventsPerSession);

  if (input.summary) {
    await storePageSummary(db, input, input.summary);

    // Low-traffic sites rarely have cron, so retention piggybacks on occasional requests.
    if (Math.random() < 0.02) {
      void getSettings(db)
        .then((settings) => pruneExpired(db, settings, 200))
        .catch((err) => logError('retention', err));
    }
  }
  return 204;
}

/**
 * Keep the latest summary per page load, then refresh the session's cached totals.
 * The cache is a convenience for direct SQL users; the dashboard always rolls up
 * `session_pages` itself, so a lost race here can never show wrong numbers.
 */
async function storePageSummary(db: Db, input: CollectInput, s: NonNullable<CollectInput['summary']>) {
  const pvid = s.pageviewId ?? LEGACY_PAGEVIEW;
  // Trackers before 0.2.1 send no seq; their session_seconds only grows within a page, so it orders them too.
  const seq = s.seq ?? s.sessionSeconds ?? 0;
  const startedAt = s.startedAt ?? input.events[0]?.ts ?? new Date();
  const summary: PageViewSummary = {
    active_seconds: s.activeSeconds,
    idle_seconds: s.idleSeconds,
    session_seconds: s.sessionSeconds,
    interactions: s.interactions,
    first_interaction_seconds: s.firstInteractionSeconds,
    sections: s.sections,
    overlays: s.overlays,
    pages: s.pages,
    max_scroll_pct: s.maxScrollPct,
  };
  await db.query(
    `INSERT INTO session_pages (sid, pvid, seq, started_at, page, summary)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (sid, pvid) DO UPDATE SET
       seq = EXCLUDED.seq, summary = EXCLUDED.summary, page = COALESCE(EXCLUDED.page, session_pages.page), updated_at = NOW()
     WHERE EXCLUDED.seq >= session_pages.seq`,
    [input.sid, pvid, seq, startedAt.toISOString(), input.page, JSON.stringify(summary)],
  );

  const { rows } = await db.query<PageViewRow>(`SELECT pvid, started_at, page, summary FROM session_pages WHERE sid = $1`, [input.sid]);
  const total = rollupPageViews(rows);
  await db.query(
    `UPDATE sessions SET
       ended_at = NOW(), updated_at = NOW(),
       active_seconds = $2, idle_seconds = $3, session_seconds = $4, interactions = $5,
       first_interaction_seconds = $6, sections = $7::jsonb, pages = $8::jsonb, max_scroll_pct = $9,
       overlays = NULL -- folded into sections by the rollup
     WHERE sid = $1`,
    [
      input.sid,
      total.active_seconds,
      total.idle_seconds,
      total.session_seconds,
      total.interactions,
      total.first_interaction_seconds,
      JSON.stringify(total.sections),
      JSON.stringify(total.pages),
      total.max_scroll_pct,
    ],
  );
}

async function insertEvents(db: Db, input: CollectInput, already: number, cap: number) {
  const room = Math.max(0, cap - already);
  const events = input.events.slice(0, room);
  if (!events.length) return;
  const values: unknown[] = [];
  const rows: string[] = [];
  for (const e of events) {
    const i = values.length;
    rows.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5}, $${i + 6}::jsonb)`);
    values.push(input.sid, input.vid, e.ts.toISOString(), e.type, e.seq, e.data ? JSON.stringify(e.data) : null);
  }
  await db.query(`INSERT INTO events (sid, vid, ts, type, seq, data) VALUES ${rows.join(', ')}`, values);
  await db.query(`UPDATE sessions SET event_count = event_count + $2 WHERE sid = $1`, [input.sid, events.length]);
}

async function ingestReplay(db: Db, body: unknown, config: DossierConfig): Promise<number> {
  const parsed = parseReplay(body);
  if (!parsed.ok) throw new HttpError(400, parsed.error);
  const { vid, sid, chunkSeq, events } = parsed.value;
  if (!events.length) return 204;
  // Postgres jsonb cannot store NUL characters.
  const encoded = JSON.stringify(events).replace(/(?<!\\)\\u0000/g, '');
  const bytes = Buffer.byteLength(encoded);

  const { rows } = await db.query<{ replay_bytes: number; is_bot: boolean | null }>(
    `UPDATE sessions SET replay_bytes = replay_bytes + $3::int, updated_at = NOW()
      WHERE sid = $1 AND vid = $2 AND replay_bytes::bigint + $3::int <= $4::bigint
      RETURNING replay_bytes, is_bot`,
    [sid, vid, bytes, Math.floor(config.replayMaxBytesPerSession)],
  );
  // Unknown session or over the per-session budget: tell the tracker to stop recording.
  if (!rows.length) return 429;
  if (rows[0]!.is_bot) return 204;
  await db.query(
    `INSERT INTO replay_events (sid, vid, chunk_seq, events, bytes) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [sid, vid, chunkSeq, encoded, bytes],
  );
  return 204;
}

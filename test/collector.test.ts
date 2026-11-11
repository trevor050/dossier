import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdminHandler } from '../src/server/admin/handler.js';
import { createCollectHandler } from '../src/server/collect.js';
import { createPgliteDb, type Db } from '../src/server/db.js';
import { LATEST_MIGRATION, migrate } from '../src/server/migrations.js';
import { deleteVisitors, pruneExpired } from '../src/server/retention.js';

/**
 * Integration tests: real handlers, real SQL, embedded Postgres (PGlite).
 */

const TOKEN = 'test-admin-token-0123456789';
const HOST = 'site.example';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let db: Db;
let collect: ReturnType<typeof createCollectHandler>;
let admin: ReturnType<typeof createAdminHandler>;
let ipCounter = 10;

beforeAll(async () => {
  process.env.DOSSIER_ADMIN_TOKEN = TOKEN;
  process.env.DOSSIER_PTR = '0';
  delete process.env.IPINFO_TOKEN;
  db = await createPgliteDb();
  await migrate(db);
  collect = createCollectHandler({ db });
  admin = createAdminHandler({ db });
});

afterAll(async () => {
  await db.close();
});

function post(body: unknown, opts: { origin?: string; ip?: string; query?: string; ua?: string; raw?: string } = {}) {
  return collect(
    new Request(`https://${HOST}/api/collect${opts.query ?? ''}`, {
      method: 'POST',
      headers: {
        host: HOST,
        origin: opts.origin ?? `https://${HOST}`,
        'content-type': 'text/plain',
        'user-agent': opts.ua ?? UA,
        'accept-language': 'en-US',
      },
      body: opts.raw ?? JSON.stringify(body),
    }),
    { ip: opts.ip ?? `203.0.113.${ipCounter++}` },
  );
}

function adminGet(route: string, params: Record<string, string> = {}, auth = true) {
  const qs = new URLSearchParams({ api: route, ...params });
  return admin(
    new Request(`https://${HOST}/api/admin?${qs}`, { headers: { host: HOST, ...(auth ? { authorization: `Bearer ${TOKEN}` } : {}) } }),
  );
}

function adminPost(route: string, body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }) {
  return admin(
    new Request(`https://${HOST}/api/admin?api=${route}`, {
      method: 'POST',
      headers: { host: HOST, origin: `https://${HOST}`, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const visit = (vid: string, sid: string, extra: Record<string, unknown> = {}) => ({
  vid,
  sid,
  scid: `cookie-${sid}`,
  page: '/',
  events: [{ type: 'visit', ts: new Date().toISOString(), seq: 0 }],
  ...extra,
});

describe('migrations', () => {
  it('are idempotent', async () => {
    expect(await migrate(db)).toEqual([]);
    const { rows } = await db.query<{ n: number }>(`SELECT MAX(id)::int AS n FROM dossier_migrations`);
    expect(rows[0]!.n).toBe(LATEST_MIGRATION);
  });
});

describe('collector', () => {
  beforeEach(async () => {
    await db.exec(`TRUNCATE visitors, links, identity_edges, session_ips CASCADE`);
  });

  it('stores a visit, its events and the session summary', async () => {
    const res = await post(
      visit('visitor-aaa', 'session-aaa', {
        events: [
          { type: 'visit', ts: new Date().toISOString(), seq: 0 },
          { type: 'click_target', ts: new Date().toISOString(), seq: 1, data: { target: 'resume' } },
        ],
        summary: { active_seconds: 42, session_seconds: 60, interactions: 3, sections: [{ key: 'projects', seconds: 30 }], max_scroll_pct: 80 },
      }),
    );
    expect(res.status).toBe(204);
    const { rows } = await db.query<Record<string, unknown>>(`SELECT * FROM sessions WHERE sid = 'session-aaa'`);
    expect(rows[0]).toMatchObject({ vid: 'visitor-aaa', active_seconds: 42, max_scroll_pct: 80, event_count: 2, is_bot: false });
    expect(rows[0]!.sections).toEqual([{ key: 'projects', seconds: 30 }]);
    expect(rows[0]!.device).toMatchObject({ browser: 'Chrome', os: 'macOS', type: 'desktop' });
  });

  it('ignores a stale summary that arrives late (legacy trackers are ordered by their own session_seconds)', async () => {
    await post(visit('visitor-bbb', 'session-bbb', { summary: { active_seconds: 50, session_seconds: 60 } }));
    await post(visit('visitor-bbb', 'session-bbb', { events: [], summary: { active_seconds: 10, session_seconds: 20 } }));
    const { rows } = await db.query<{ active_seconds: number }>(`SELECT active_seconds FROM sessions WHERE sid = 'session-bbb'`);
    expect(rows[0]!.active_seconds).toBe(50);
  });

  it('refuses foreign origins, bad payloads and oversized bodies', async () => {
    expect((await post(visit('visitor-ccc', 'session-ccc'), { origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ vid: 'x' })).status).toBe(400);
    expect((await post(null, { raw: '{not json' })).status).toBe(400);
    expect((await post(null, { raw: JSON.stringify({ ...visit('visitor-ccc', 'session-ccc'), pad: 'x'.repeat(70_000) }) })).status).toBe(413);
    const { rows } = await db.query(`SELECT 1 FROM sessions WHERE sid = 'session-ccc'`);
    expect(rows).toHaveLength(0);
  });

  it('drops opted-out (internal) requests', async () => {
    expect((await post(visit('visitor-ddd', 'session-ddd', { internal: true }))).status).toBe(204);
    expect((await db.query(`SELECT 1 FROM visitors WHERE vid = 'visitor-ddd'`)).rows).toHaveLength(0);
  });

  it('flags bots and keeps them out of the identity graph', async () => {
    await post(visit('visitor-bot', 'session-bot'), { ua: 'curl/8.7.1' });
    const { rows } = await db.query<{ is_bot: boolean; bot_reasons: string }>(`SELECT is_bot, bot_reasons FROM sessions WHERE sid = 'session-bot'`);
    expect(rows[0]).toEqual({ is_bot: true, bot_reasons: 'http client' });
    expect((await db.query(`SELECT 1 FROM identity_edges WHERE a = 'vid:visitor-bot' OR b = 'vid:visitor-bot'`)).rows).toHaveLength(0);
  });

  it('caps events per session', async () => {
    process.env.DOSSIER_MAX_EVENTS_PER_SESSION = '100';
    const events = Array.from({ length: 150 }, (_, i) => ({ type: 'tick', seq: i, ts: new Date().toISOString() }));
    await post(visit('visitor-cap', 'session-cap', { events: events.slice(0, 80) }));
    await post(visit('visitor-cap', 'session-cap', { events: events.slice(80) }));
    delete process.env.DOSSIER_MAX_EVENTS_PER_SESSION;
    const { rows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM events WHERE sid = 'session-cap'`);
    expect(rows[0]!.n).toBe(100);
  });

  it('stores replay chunks within the per-session budget, then answers 429', async () => {
    await post(visit('visitor-rep', 'session-rep'));
    const chunk = { vid: 'visitor-rep', sid: 'session-rep', events: [{ type: 2, timestamp: 1, data: { pad: 'x'.repeat(40_000) } }] };
    process.env.DOSSIER_REPLAY_MAX_MB = '0.1'; // ~104 KB
    expect((await post(chunk, { query: '?kind=replay' })).status).toBe(204);
    expect((await post(chunk, { query: '?kind=replay' })).status).toBe(204);
    expect((await post(chunk, { query: '?kind=replay' })).status).toBe(429);
    delete process.env.DOSSIER_REPLAY_MAX_MB;
    const { rows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM replay_events WHERE sid = 'session-rep'`);
    expect(rows[0]!.n).toBe(2);
    // Unknown session: refused so the tracker stops recording.
    expect((await post({ ...chunk, sid: 'session-unknown' }, { query: '?kind=replay' })).status).toBe(429);
  });

  it('serves the tracker script and lazy chunks on GET', async () => {
    const res = await collect(new Request(`https://${HOST}/api/collect`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect((await collect(new Request(`https://${HOST}/api/collect?asset=recorder`))).status).toBe(200);
    expect((await collect(new Request(`https://${HOST}/api/collect?asset=../../etc/passwd`))).status).toBe(404);
  });
});

describe('named links', () => {
  beforeEach(async () => {
    await db.exec(`TRUNCATE visitors, links, identity_edges, session_ips CASCADE`);
  });

  it('attributes visits by slug or private code, including visits that arrived before the link existed', async () => {
    await post(visit('visitor-early', 'session-early', { ref_tag: 'colgate-admissions' }));
    const created = await adminPost('links', { label: 'Colgate admissions' });
    expect(created.status).toBe(200);
    const { link } = (await created.json()) as { link: { id: string; slug: string } };
    expect(link.slug).toBe('colgate-admissions');
    expect(link.id).toMatch(/^[a-z2-9]{7}$/);

    await post(visit('visitor-later', 'session-later', { ref_tag: link.id }));
    const overview = (await (await adminGet('overview')).json()) as {
      links: Array<{ id: string; opened: boolean; visits: number; people: number }>;
      people: unknown[];
    };
    expect(overview.links).toHaveLength(1);
    expect(overview.links[0]).toMatchObject({ id: link.id, opened: true, visits: 2, people: 2 });
    expect(overview.people).toHaveLength(0); // linked visitors are not repeated under "everyone else"
  });

  it('shows links that were never opened', async () => {
    await adminPost('links', { label: 'Hackathon judges' });
    const overview = (await (await adminGet('overview')).json()) as { links: Array<{ opened: boolean; label: string }> };
    expect(overview.links[0]).toMatchObject({ label: 'Hackathon judges', opened: false });
  });

  it('rejects duplicate slugs', async () => {
    expect((await adminPost('links', { label: 'Mom' })).status).toBe(200);
    expect((await adminPost('links', { label: 'mom' })).status).toBe(400);
  });
});

describe('admin API', () => {
  beforeEach(async () => {
    await db.exec(`TRUNCATE visitors, links, identity_edges, session_ips CASCADE`);
  });

  it('requires authentication', async () => {
    expect((await adminGet('overview', {}, false)).status).toBe(401);
    const status = (await (await adminGet('status', {}, false)).json()) as { authed: boolean };
    expect(status.authed).toBe(false);
  });

  it('logs in with the token and sets an HttpOnly, SameSite=Strict cookie scoped to the admin path', async () => {
    expect((await adminPost('login', { token: 'wrong-token-wrong-token' }, {})).status).toBe(401);
    const res = await adminPost('login', { token: TOKEN }, {});
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie')!;
    expect(cookie).toMatch(/^dossier_admin=\d+\.[\w-]+; Path=\/api\/admin; Max-Age=\d+; HttpOnly; SameSite=Strict; Secure$/);
    expect(cookie).not.toContain(TOKEN);
    const session = cookie.split(';')[0]!;
    const authed = await admin(new Request(`https://${HOST}/api/admin?api=overview`, { headers: { host: HOST, cookie: session } }));
    expect(authed.status).toBe(200);
  });

  it('refuses cross-site state changes even with a valid session', async () => {
    const res = await admin(
      new Request(`https://${HOST}/api/admin?api=delete`, {
        method: 'POST',
        headers: { host: HOST, origin: 'https://evil.example', authorization: `Bearer ${TOKEN}` },
        body: JSON.stringify({ vids: ['x'] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it('serves the dashboard with a strict CSP', async () => {
    const res = await admin(new Request(`https://${HOST}/api/admin`, { headers: { host: HOST } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('groups a returning visitor into one person with linked evidence', async () => {
    // Same browser session cookie, different visitor ids (e.g. storage was cleared).
    await post({ ...visit('visitor-one', 'session-one'), scid: 'shared-cookie-1' });
    await post({ ...visit('visitor-two', 'session-two'), scid: 'shared-cookie-1' });
    await post(visit('visitor-stranger', 'session-stranger'));
    const overview = (await (await adminGet('overview')).json()) as { people: Array<{ vids: string[]; visits: number }> };
    const grouped = overview.people.find((p) => p.vids.length === 2);
    expect(grouped?.vids.sort()).toEqual(['visitor-one', 'visitor-two']);
    expect(overview.people).toHaveLength(2);
    const person = (await (await adminGet('person', { id: 'visitor-two' })).json()) as { evidence: Array<{ sharedCookie: boolean }> };
    expect(person.evidence[0]?.sharedCookie).toBe(true);
  });
});

describe('retention and deletion', () => {
  beforeEach(async () => {
    await db.exec(`TRUNCATE visitors, links, identity_edges, session_ips, ipinfo_cache, ptr_cache CASCADE`);
  });

  it('deletes a visitor and everything derived from them', async () => {
    await post(visit('visitor-gone', 'session-gone', { fpid: 'fingerprint-1' }), { ip: '198.51.100.1' });
    await post({ vid: 'visitor-gone', sid: 'session-gone', events: [{ type: 3, timestamp: 1 }] }, { query: '?kind=replay', ip: '198.51.100.1' });
    await db.query(`INSERT INTO ipinfo_cache (ip, data, fetched_at) VALUES ('198.51.100.1', '{}', NOW())`);
    await post(visit('visitor-stays', 'session-stays'));

    const res = await adminPost('delete', { vids: ['visitor-gone'] });
    expect(await res.json()).toEqual({ visitors: 1, sessions: 1 });

    for (const [table, where] of [
      ['visitors', `vid = 'visitor-gone'`],
      ['sessions', `vid = 'visitor-gone'`],
      ['events', `vid = 'visitor-gone'`],
      ['replay_events', `vid = 'visitor-gone'`],
      ['session_ips', `ip = '198.51.100.1'`],
      ['ipinfo_cache', `ip = '198.51.100.1'`],
      ['identity_edges', `a LIKE '%visitor-gone%' OR b LIKE '%visitor-gone%' OR a LIKE 'fp:fingerprint-1' OR b LIKE 'fp:fingerprint-1'`],
    ]) {
      expect((await db.query(`SELECT 1 FROM ${table} WHERE ${where}`)).rows, table).toHaveLength(0);
    }
    expect((await db.query(`SELECT 1 FROM visitors WHERE vid = 'visitor-stays'`)).rows).toHaveLength(1);
    expect(await deleteVisitors(db, [])).toEqual({ visitors: 0, sessions: 0 });
  });

  it('prunes sessions and replays past their retention windows', async () => {
    await post(visit('visitor-old', 'session-old'));
    await post(visit('visitor-new', 'session-new'));
    await post({ vid: 'visitor-new', sid: 'session-new', events: [{ type: 3, timestamp: 1 }] }, { query: '?kind=replay' });
    await db.query(`UPDATE sessions SET started_at = NOW() - INTERVAL '400 days' WHERE sid = 'session-old'`);
    await db.query(`UPDATE visitors SET last_seen_at = NOW() - INTERVAL '400 days' WHERE vid = 'visitor-old'`);
    await db.query(`UPDATE replay_events SET ts = NOW() - INTERVAL '40 days'`);

    const result = await pruneExpired(db, { retention_human_days: 365, retention_bot_days: 30, retention_replay_days: 30 });
    expect(result).toMatchObject({ sessions: 1, replay_chunks: 1, visitors: 1 });
    expect((await db.query(`SELECT vid FROM visitors`)).rows).toEqual([{ vid: 'visitor-new' }]);
  });
});

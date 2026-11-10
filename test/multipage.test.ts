import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdminHandler } from '../src/server/admin/handler.js';
import { createCollectHandler } from '../src/server/collect.js';
import { createPgliteDb, type Db } from '../src/server/db.js';
import { migrate } from '../src/server/migrations.js';

/**
 * Regression tests for visits that span several page loads, and for client
 * actions reported as more than one event. Found by colgate-room-portfolio.
 */

const TOKEN = 'test-admin-token-0123456789';
const HOST = 'site.example';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

let db: Db;
let collect: ReturnType<typeof createCollectHandler>;
let admin: ReturnType<typeof createAdminHandler>;

beforeAll(async () => {
  process.env.DOSSIER_ADMIN_TOKEN = TOKEN;
  process.env.DOSSIER_PTR = '0';
  db = await createPgliteDb();
  await migrate(db);
  collect = createCollectHandler({ db });
  admin = createAdminHandler({ db });
});
afterAll(() => db.close());
beforeEach(() => db.exec(`TRUNCATE visitors, links, identity_edges, session_ips CASCADE`));

async function post(body: Record<string, unknown>) {
  const res = await collect(
    new Request(`https://${HOST}/api/collect`, {
      method: 'POST',
      headers: { host: HOST, origin: `https://${HOST}`, 'user-agent': UA, 'accept-language': 'en-US' },
      body: JSON.stringify({ vid: 'visitor-mp', sid: 'session-mp', ...body }),
    }),
    { ip: '203.0.113.50' },
  );
  expect(res.status).toBe(204);
}

async function get<T>(route: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ api: route, ...params });
  const res = await admin(new Request(`https://${HOST}/api/admin?${qs}`, { headers: { host: HOST, authorization: `Bearer ${TOKEN}` } }));
  expect(res.status).toBe(200);
  return (await res.json()) as T;
}

type SessionData = {
  session: { active_seconds: number; session_seconds: number; interactions: number; sections: Array<{ key: string; seconds: number }>; pages: string[]; first_interaction_seconds?: number };
  events: Array<{ type: string; data: Record<string, unknown> | null; also?: Array<{ type: string }> }>;
};

const t0 = Date.now() - 600_000;
const iso = (offsetSeconds: number) => new Date(t0 + offsetSeconds * 1000).toISOString();

/** A summary for one page load, as the 0.2.1 tracker sends it. */
function summary(pageview: string, seq: number, startedAt: number, fields: Record<string, unknown>) {
  return { summary: { pageview_id: pageview, seq, started_at: iso(startedAt), ...fields } };
}

describe('multi-page visits', () => {
  it('sums time and keeps every page and section across page loads', async () => {
    // Page load 1: the room at /
    await post({ page: '/', events: [{ type: 'visit', ts: iso(0) }] });
    await post({
      page: '/',
      ...summary('pv-room-0001', 1, 0, {
        active_seconds: 30, session_seconds: 40, interactions: 4,
        sections: [{ key: 'projects', seconds: 20 }, { key: 'about', seconds: 10 }], pages: ['/'],
      }),
    });
    // Page load 2: /resume
    await post({ page: '/resume', events: [{ type: 'visit', ts: iso(60) }] });
    await post({
      page: '/resume',
      ...summary('pv-resume-001', 1, 60, {
        active_seconds: 15, session_seconds: 20, interactions: 1,
        sections: [{ key: 'resume', seconds: 12 }, { key: 'projects', seconds: 3 }], pages: ['/resume'],
      }),
    });

    const { session } = await get<SessionData>('session', { sid: 'session-mp' });
    expect(session.active_seconds).toBe(45);
    expect(session.session_seconds).toBe(60);
    expect(session.interactions).toBe(5);
    expect(session.pages).toEqual(['/', '/resume']);
    expect(session.sections).toEqual([
      { key: 'projects', seconds: 23 },
      { key: 'resume', seconds: 12 },
      { key: 'about', seconds: 10 },
    ]);
  });

  it('does not double count retries, duplicate pagehide posts or out-of-order summaries', async () => {
    await post({ page: '/', events: [{ type: 'visit', ts: iso(0) }] });
    const later = summary('pv-room-0002', 3, 0, { active_seconds: 50, sections: [{ key: 'projects', seconds: 40 }], pages: ['/'] });
    const earlier = summary('pv-room-0002', 2, 0, { active_seconds: 20, sections: [{ key: 'projects', seconds: 15 }], pages: ['/'] });
    await post({ page: '/', ...later });
    await post({ page: '/', ...later }); // retry / second pagehide
    await post({ page: '/', ...earlier }); // a heartbeat that arrived late
    await post({ page: '/next', ...summary('pv-next-00002', 1, 70, { active_seconds: 5, pages: ['/next'] }) });
    await post({ page: '/next', ...summary('pv-next-00002', 1, 70, { active_seconds: 5, pages: ['/next'] }) });

    const { session } = await get<SessionData>('session', { sid: 'session-mp' });
    expect(session.active_seconds).toBe(55);
    expect(session.sections).toEqual([{ key: 'projects', seconds: 40 }]);
    expect(session.pages).toEqual(['/', '/next']);
  });

  it('orders pages by when each page load started, not by arrival', async () => {
    await post({ page: '/b', ...summary('pv-second-001', 1, 100, { active_seconds: 1, pages: ['/b'] }) });
    await post({ page: '/a', ...summary('pv-first-0001', 1, 10, { active_seconds: 1, pages: ['/a', '/a#modal', '/a'] }) });
    const { session } = await get<SessionData>('session', { sid: 'session-mp' });
    expect(session.pages).toEqual(['/a', '/a#modal', '/a', '/b']);
  });

  it('keeps last-write-wins behavior for trackers that do not send a page view id (0.1)', async () => {
    await post({ page: '/', summary: { active_seconds: 10, overlays: [{ key: 'resume', seconds: 8 }] } });
    await post({ page: '/', summary: { active_seconds: 25, overlays: [{ key: 'resume', seconds: 20 }] } });
    const { session } = await get<SessionData>('session', { sid: 'session-mp' });
    expect(session.active_seconds).toBe(25);
    expect(session.sections).toEqual([{ key: 'resume', seconds: 20 }]);
  });
});

describe('one user action, several events', () => {
  const clickAndOpen = (key: string, at: number) => [
    { type: 'click_target', ts: iso(at), data: { target: key } },
    { type: 'open_overlay', ts: iso(at + 0.05), data: { overlay: key } },
  ];

  it('counts a click that also opened an overlay once', async () => {
    await post({ events: [...clickAndOpen('projects', 1), ...clickAndOpen('projects', 30), ...clickAndOpen('resume', 60)] });
    const person = await get<{ clicks: Array<{ label: string; count: number }> }>('person', { id: 'visitor-mp' });
    expect(person.clicks).toEqual([
      { label: 'projects', count: 2 },
      { label: 'resume', count: 1 },
    ]);
  });

  it('still counts sites that send only one of the two event types', async () => {
    await post({
      events: [
        { type: 'open_overlay', ts: iso(1), data: { overlay: 'resume' } },
        { type: 'open_overlay', ts: iso(9), data: { overlay: 'resume' } },
        { type: 'click_target', ts: iso(20), data: { target: 'download' } },
      ],
    });
    const person = await get<{ clicks: Array<{ label: string; count: number }> }>('person', { id: 'visitor-mp' });
    expect(person.clicks).toEqual([
      { label: 'resume', count: 2 },
      { label: 'download', count: 1 },
    ]);
  });

  it('counts a tracked link click once even though it is also a link click', async () => {
    await post({
      events: [
        { type: 'click_target', ts: iso(1), data: { target: 'github' } },
        { type: 'click_link', ts: iso(1.01), data: { host: 'github.com', path: '/trevor050' } },
        { type: 'click_link', ts: iso(40), data: { host: 'example.com', path: '/' } },
      ],
    });
    const person = await get<{ clicks: Array<{ label: string; count: number }> }>('person', { id: 'visitor-mp' });
    expect(person.clicks).toEqual([
      { label: 'example.com/', count: 1 },
      { label: 'github', count: 1 },
    ]);
  });

  it('shows the pair as one line in the visit timeline', async () => {
    await post({ events: [{ type: 'visit', ts: iso(0) }, ...clickAndOpen('projects', 1)] });
    const { events } = await get<SessionData>('session', { sid: 'session-mp' });
    expect(events.map((e) => e.type)).toEqual(['visit', 'click_target']);
    expect(events[1]!.also?.map((e) => e.type)).toEqual(['open_overlay']);
  });
});

describe('migration 3 (per-page summaries)', () => {
  it('carries existing session summaries over as a single page view', async () => {
    const { MIGRATIONS } = await import('../src/server/migrations.js');
    const { loadSessions } = await import('../src/server/admin/people.js');
    const old = await createPgliteDb();
    try {
      // A database as Dossier 0.2.0 left it: migrations 1 and 2 only.
      await old.exec(`CREATE TABLE dossier_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
      for (const m of MIGRATIONS.filter((x) => x.id <= 2)) {
        await old.exec(m.sql);
        await old.query(`INSERT INTO dossier_migrations (id, name) VALUES ($1, $2)`, [m.id, m.name]);
      }
      await old.exec(`
        INSERT INTO visitors (vid) VALUES ('visitor-old');
        INSERT INTO sessions (sid, vid, started_at, page, active_seconds, session_seconds, interactions, sections, overlays, pages, max_scroll_pct)
        VALUES ('session-old', 'visitor-old', NOW() - INTERVAL '1 day', '/', 42, 60, 3,
                '[{"key":"projects","seconds":30}]', '[{"key":"resume","seconds":9}]', '["/"]', 70),
               ('session-nosummary', 'visitor-old', NOW() - INTERVAL '2 days', '/', NULL, NULL, NULL, NULL, NULL, NULL, NULL);
      `);
      expect(await migrate(old)).toEqual(['3_per-page-summaries']);

      const { rows } = await old.query<{ sid: string; pvid: string }>(`SELECT sid, pvid FROM session_pages`);
      expect(rows).toEqual([{ sid: 'session-old', pvid: '_legacy' }]);
      const [nosummary, s] = await loadSessions(old, { days: 30, includeBots: true });
      expect(nosummary!.active_seconds).toBe(0);
      expect(s).toMatchObject({ active_seconds: 42, session_seconds: 60, interactions: 3, pages: ['/'], max_scroll_pct: 70 });
      expect(s!.sections).toEqual([
        { key: 'projects', seconds: 30 },
        { key: 'resume', seconds: 9 },
      ]);
    } finally {
      await old.close();
    }
  });
});

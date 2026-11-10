import type { DossierConfig } from '../config.js';
import type { Db } from '../db.js';
import { getSettings } from '../retention.js';
import {
  buildPeople,
  loadLinks,
  loadSessions,
  mergeDwell,
  personEvidence,
  publicSession,
  summarizeLinks,
  summarizePerson,
} from './people.js';

const iso = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));

/** Home screen: every named link (opened or not), then everyone who arrived without one. */
export async function overview(db: Db, config: DossierConfig, opts: { days: number; includeBots: boolean }) {
  const links = await loadLinks(db);
  const labels = new Map(links.map((l) => [l.id, l.label]));
  // Links need full history so "opened 4 months ago" still shows.
  const sessions = await loadSessions(db, { days: Math.max(opts.days, 3650), includeBots: opts.includeBots });
  const index = await buildPeople(db, sessions, config.linkThreshold, labels);
  const since = Date.now() - opts.days * 86_400_000;
  const others = index.people.filter((p) => !p.link_ids.length && Date.parse(p.last_seen) >= since);
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM sessions WHERE COALESCE(is_bot, false) AND started_at > NOW() - ($1::int * INTERVAL '1 day')`,
    [opts.days],
  );
  return {
    days: opts.days,
    links: summarizeLinks(links, index),
    people: others,
    hidden_bot_sessions: opts.includeBots ? 0 : Number(rows[0]?.n ?? 0),
  };
}

export async function person(db: Db, config: DossierConfig, id: string, days: number) {
  const links = await loadLinks(db);
  const labels = new Map(links.map((l) => [l.id, l.label]));
  const sessions = await loadSessions(db, { days, includeBots: true });
  const index = await buildPeople(db, sessions, config.linkThreshold, labels);
  const pid = index.personOfVid.get(id) ?? id;
  const list = index.sessionsByPerson.get(pid);
  if (!list?.length) return null;
  const summary = summarizePerson(pid, list, labels);
  const vids = summary.vids;

  const { rows: clicks } = await db.query<{ label: string; count: number }>(
    `SELECT COALESCE(data->>'target', data->>'overlay', CONCAT(data->>'host', data->>'path'), type) AS label, COUNT(*)::int AS count
       FROM events
      WHERE vid = ANY($1::text[]) AND type IN ('click_target', 'click_link', 'open_overlay')
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
    [vids],
  );
  const { rows: ips } = await db.query<Record<string, unknown>>(
    `SELECT si.ip, MAX(si.last_seen_at) AS last_seen, MAX(s.ptr) AS ptr, MAX(s.ipinfo->>'org') AS org
       FROM session_ips si JOIN sessions s ON s.sid = si.sid
      WHERE s.vid = ANY($1::text[])
      GROUP BY si.ip ORDER BY 2 DESC LIMIT 20`,
    [vids],
  );
  const { rows: visitorRows } = await db.query<Record<string, unknown>>(
    `SELECT vid, display_name, label, first_seen_at, last_seen_at, bot_override FROM visitors WHERE vid = ANY($1::text[])`,
    [vids],
  );

  const pages = new Map<string, number>();
  for (const s of list) for (const p of new Set([s.page, ...s.pages].filter((x): x is string => !!x))) pages.set(p, (pages.get(p) ?? 0) + 1);

  return {
    person: summary,
    links: links.filter((l) => summary.link_ids.includes(l.id)),
    visitors: visitorRows.map((v) => ({
      vid: String(v.vid),
      display_name: v.display_name ?? null,
      label: v.label ?? null,
      first_seen: iso(v.first_seen_at),
      last_seen: iso(v.last_seen_at),
      bot_override: v.bot_override ?? null,
    })),
    sessions: [...list].reverse().map(publicSession),
    attention: mergeDwell(list.map((s) => s.sections)),
    pages: [...pages.entries()].map(([path, visits]) => ({ path, visits })).sort((a, b) => b.visits - a.visits),
    clicks,
    ips: ips.map((r) => ({ ip: r.ip, last_seen: iso(r.last_seen), ptr: r.ptr ?? null, org: r.org ?? null })),
    evidence: await personEvidence(db, vids, config.linkThreshold),
  };
}

export async function session(db: Db, sid: string) {
  const sessions = await db.query<{ vid: string }>(`SELECT vid FROM sessions WHERE sid = $1`, [sid]);
  const vid = sessions.rows[0]?.vid;
  if (!vid) return null;
  const all = await loadSessions(db, { days: 3650, includeBots: true, vids: [vid] });
  const s = all.find((x) => x.sid === sid);
  if (!s) return null;
  const { rows: events } = await db.query<Record<string, unknown>>(
    `SELECT ts, type, data FROM events WHERE sid = $1 ORDER BY ts, seq NULLS FIRST, id LIMIT 2000`,
    [sid],
  );
  const { rows: replay } = await db.query<{ chunks: number; bytes: number }>(
    `SELECT COUNT(*)::int AS chunks, COALESCE(SUM(bytes), 0)::int AS bytes FROM replay_events WHERE sid = $1`,
    [sid],
  );
  return {
    session: publicSession(s),
    events: events.map((e) => ({ ts: iso(e.ts), type: e.type, data: e.data ?? null })),
    replay: { chunks: Number(replay[0]?.chunks ?? 0), bytes: Number(replay[0]?.bytes ?? 0) },
  };
}

export async function replay(db: Db, sid: string, fromId: number) {
  const { rows } = await db.query<{ id: string | number; events: unknown }>(
    `SELECT id, events FROM replay_events WHERE sid = $1 AND id > $2 ORDER BY id LIMIT 40`,
    [sid, Math.max(0, Math.trunc(fromId))],
  );
  const events = rows.flatMap((r) => (Array.isArray(r.events) ? r.events : []));
  const last = rows[rows.length - 1];
  return { sid, next: last ? Number(last.id) : null, events, done: rows.length < 40 };
}

export async function map(db: Db, config: DossierConfig, opts: { days: number; includeBots: boolean }) {
  const links = await loadLinks(db);
  const labels = new Map(links.map((l) => [l.id, l.label]));
  const sessions = await loadSessions(db, opts);
  const index = await buildPeople(db, sessions, config.linkThreshold, labels);
  return {
    points: index.people
      .filter((p) => p.location?.lat != null && p.location?.lon != null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        named: p.name_source === 'link' || p.name_source === 'label',
        visits: p.visits,
        last_seen: p.last_seen,
        is_bot: p.is_bot,
        lat: p.location!.lat!,
        lon: p.location!.lon!,
        place: [p.location!.city, p.location!.region, p.location!.country].filter(Boolean).join(', '),
      })),
    unplaced: index.people.filter((p) => p.location?.lat == null).length,
  };
}

export async function bots(db: Db, days: number) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT sid, vid, started_at, ip, ptr, user_agent, bot_score, bot_reasons, geo, ipinfo
       FROM sessions WHERE COALESCE(is_bot, false) AND started_at > NOW() - ($1::int * INTERVAL '1 day')
      ORDER BY started_at DESC LIMIT 300`,
    [days],
  );
  const reasons = new Map<string, number>();
  for (const r of rows) {
    for (const reason of String(r.bot_reasons ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    }
  }
  return {
    days,
    sessions: rows.map((r) => {
      const geo = (r.geo ?? {}) as Record<string, unknown>;
      const ipinfo = (r.ipinfo ?? {}) as Record<string, unknown>;
      return {
        sid: r.sid,
        vid: r.vid,
        started_at: iso(r.started_at),
        ip: r.ip ?? null,
        ptr: r.ptr ?? null,
        user_agent: r.user_agent ?? null,
        score: Number(r.bot_score ?? 0),
        reasons: r.bot_reasons ?? null,
        country: geo.country ?? ipinfo.country ?? null,
        org: ipinfo.org ?? null,
      };
    }),
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
  };
}

/** What gets attention across all human visitors. */
export async function content(db: Db, days: number) {
  const sessions = await loadSessions(db, { days, includeBots: false });
  const sections = new Map<string, { seconds: number; vids: Set<string> }>();
  const pages = new Map<string, Set<string>>();
  const referrers = new Map<string, number>();
  for (const s of sessions) {
    for (const d of s.sections) {
      const e = sections.get(d.key) ?? { seconds: 0, vids: new Set<string>() };
      e.seconds += d.seconds;
      e.vids.add(s.vid);
      sections.set(d.key, e);
    }
    for (const p of new Set([s.page, ...s.pages].filter((x): x is string => !!x))) {
      const set = pages.get(p) ?? new Set<string>();
      set.add(s.vid);
      pages.set(p, set);
    }
    const ref = s.referrer_host ?? (s.ref_tag ? null : 'direct');
    if (ref) referrers.set(ref, (referrers.get(ref) ?? 0) + 1);
  }
  return {
    days,
    sessions: sessions.length,
    sections: [...sections.entries()]
      .map(([key, v]) => ({ key, seconds: v.seconds, visitors: v.vids.size }))
      .sort((a, b) => b.seconds - a.seconds),
    pages: [...pages.entries()].map(([path, v]) => ({ path, visitors: v.size })).sort((a, b) => b.visitors - a.visitors),
    referrers: [...referrers.entries()].map(([host, visits]) => ({ host, visits })).sort((a, b) => b.visits - a.visits),
  };
}

export async function settings(db: Db, config: DossierConfig) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT (SELECT COUNT(*)::int FROM visitors) AS visitors, (SELECT COUNT(*)::int FROM sessions) AS sessions,
            (SELECT COUNT(*)::int FROM events) AS events, (SELECT COALESCE(SUM(bytes), 0)::bigint FROM replay_events) AS replay_bytes`,
  );
  return {
    settings: await getSettings(db),
    storage: {
      visitors: Number(rows[0]?.visitors ?? 0),
      sessions: Number(rows[0]?.sessions ?? 0),
      events: Number(rows[0]?.events ?? 0),
      replay_bytes: Number(rows[0]?.replay_bytes ?? 0),
    },
    enrichment: {
      ipinfo: config.ipinfoToken ? config.ipinfoApi : null,
      ipwhois: config.ipwhois,
      ptr: config.ptr,
    },
    bot_threshold: config.botThreshold,
    link_threshold: config.linkThreshold,
  };
}

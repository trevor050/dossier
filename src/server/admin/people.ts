import type { Dwell } from '../../protocol.js';
import type { Db } from '../db.js';
import { clusterVisitors, loadEdges, resolveLinks, type Link } from '../identity.js';
import { makeDisplayName } from '../names.js';

/** One session row, shaped for the dashboard. */
export type SessionView = {
  sid: string;
  vid: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  session_seconds: number;
  interactions: number;
  page: string | null;
  pages: string[];
  sections: Dwell[];
  max_scroll_pct: number | null;
  referrer_host: string | null;
  ref_tag: string | null;
  link_id: string | null;
  location: Place | null;
  org: string | null;
  ptr: string | null;
  ip: string | null;
  device: Device;
  is_bot: boolean;
  bot_score: number;
  bot_reasons: string | null;
  has_replay: boolean;
};

export type Place = { city: string | null; region: string | null; country: string | null; lat: number | null; lon: number | null };
export type Device = { browser: string | null; os: string | null; type: string | null; screen: string | null };

export type PersonSummary = {
  id: string;
  name: string;
  /** Why the name is what it is: a manual label, a named link, an unregistered ?to= tag, or a pseudonym. */
  name_source: 'label' | 'link' | 'tag' | 'pseudonym';
  vids: string[];
  link_ids: string[];
  tags: string[];
  visits: number;
  visit_days: string[];
  first_seen: string;
  last_seen: string;
  active_seconds: number;
  top: Dwell[];
  location: Place | null;
  org: string | null;
  ptr: string | null;
  device: Device;
  is_bot: boolean;
  bot_reasons: string | null;
  has_replay: boolean;
  referrer_host: string | null;
};

export type LinkSummary = {
  id: string;
  slug: string;
  label: string;
  path: string;
  note: string | null;
  created_at: string;
  archived: boolean;
  opened: boolean;
  people: number;
  person_ids: string[];
  visits: number;
  visit_days: string[];
  first_opened_at: string | null;
  last_seen: string | null;
  active_seconds: number;
  top: Dwell[];
  location: Place | null;
  device: Device | null;
};

type SessionRecord = SessionView & {
  label: string | null;
  display_name: string | null;
  sections_raw: unknown;
  overlays_raw: unknown;
};

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const optNum = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

function dwell(v: unknown): Dwell[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((d): d is { key: string; seconds: number } => !!d && typeof d.key === 'string')
    .map((d) => ({ key: d.key, seconds: num(d.seconds) }));
}

export function mergeDwell(lists: Dwell[][], limit = Infinity): Dwell[] {
  const total = new Map<string, number>();
  for (const list of lists) for (const d of list) total.set(d.key, (total.get(d.key) ?? 0) + d.seconds);
  return [...total.entries()]
    .map(([key, seconds]) => ({ key, seconds }))
    .filter((d) => d.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key))
    .slice(0, limit);
}

function place(geo: unknown): Place | null {
  if (!geo || typeof geo !== 'object') return null;
  const g = geo as Record<string, unknown>;
  const p = {
    city: str(g.city),
    region: str(g.region),
    country: str(g.country),
    lat: optNum(g.lat ?? g.latitude),
    lon: optNum(g.lon ?? g.longitude),
  };
  return p.city || p.country ? p : null;
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function dayKey(ts: string): string {
  return ts.slice(0, 10);
}

/** Load sessions in the window, oldest first. */
export async function loadSessions(
  db: Db,
  opts: { days: number; includeBots: boolean; vids?: string[]; limit?: number },
): Promise<SessionRecord[]> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT s.sid, s.vid, s.started_at, s.ended_at, s.active_seconds, s.session_seconds, s.interactions, s.page, s.pages,
            s.sections, s.overlays, s.max_scroll_pct, s.referrer, s.ref_tag, s.link_id, s.geo, s.ipinfo, s.ptr, s.ip,
            s.device, s.user_agent, s.is_mobile, COALESCE(s.is_bot, false) AS is_bot, COALESCE(s.bot_score, 0) AS bot_score,
            s.bot_reasons, (s.replay_bytes > 0 OR EXISTS (SELECT 1 FROM replay_events r WHERE r.sid = s.sid)) AS has_replay,
            v.label, v.display_name
       FROM sessions s JOIN visitors v ON v.vid = s.vid
      WHERE s.started_at > NOW() - ($1::int * INTERVAL '1 day')
        AND ($2::boolean OR COALESCE(s.is_bot, false) = false)
        AND ($3::text[] IS NULL OR s.vid = ANY($3::text[]))
      ORDER BY s.started_at DESC
      LIMIT $4`,
    [opts.days, opts.includeBots, opts.vids ?? null, opts.limit ?? 5000],
  );
  return rows.reverse().map((r) => {
    const device = (r.device ?? {}) as Record<string, unknown>;
    const ipinfo = (r.ipinfo ?? {}) as Record<string, unknown>;
    const sections = dwell(r.sections);
    const overlays = dwell(r.overlays);
    return {
      sid: String(r.sid),
      vid: String(r.vid),
      started_at: iso(r.started_at),
      ended_at: r.ended_at ? iso(r.ended_at) : null,
      active_seconds: num(r.active_seconds),
      session_seconds: num(r.session_seconds),
      interactions: num(r.interactions),
      page: str(r.page),
      pages: Array.isArray(r.pages) ? (r.pages as unknown[]).filter((p): p is string => typeof p === 'string') : [],
      sections: mergeDwell([sections, overlays]),
      max_scroll_pct: optNum(r.max_scroll_pct),
      referrer_host: hostOf(r.referrer),
      ref_tag: str(r.ref_tag),
      link_id: str(r.link_id),
      location: place(r.geo) ?? place(ipinfo),
      org: str(ipinfo.org) ?? str((r.geo as Record<string, unknown> | null)?.asName),
      ptr: str(r.ptr),
      ip: str(r.ip),
      device: {
        browser: str(device.browser),
        os: str(device.os),
        type: str(device.type) ?? (r.is_mobile === true ? 'mobile' : r.is_mobile === false ? 'desktop' : null),
        screen: str(device.screen),
      },
      is_bot: r.is_bot === true,
      bot_score: num(r.bot_score),
      bot_reasons: str(r.bot_reasons),
      has_replay: r.has_replay === true,
      label: str(r.label),
      display_name: str(r.display_name),
      sections_raw: r.sections,
      overlays_raw: r.overlays,
    };
  });
}

export function publicSession(s: SessionRecord): SessionView {
  const { label: _l, display_name: _d, sections_raw: _s, overlays_raw: _o, ...rest } = s;
  return rest;
}

export type PeopleIndex = {
  people: PersonSummary[];
  sessionsByPerson: Map<string, SessionRecord[]>;
  personOfVid: Map<string, string>;
};

/** Group sessions into people: identity-graph clusters of visitor ids. */
export async function buildPeople(
  db: Db,
  sessions: SessionRecord[],
  linkThreshold: number,
  linkLabels: Map<string, string>,
): Promise<PeopleIndex> {
  const vids = [...new Set(sessions.map((s) => s.vid))];
  const edges = vids.length ? await loadEdges(db) : [];
  const personOfVid = clusterVisitors(vids, edges, { threshold: linkThreshold });

  const sessionsByPerson = new Map<string, SessionRecord[]>();
  for (const s of sessions) {
    const pid = personOfVid.get(s.vid) ?? s.vid;
    const list = sessionsByPerson.get(pid);
    if (list) list.push(s);
    else sessionsByPerson.set(pid, [s]);
  }

  const people: PersonSummary[] = [];
  for (const [id, list] of sessionsByPerson) people.push(summarizePerson(id, list, linkLabels));
  people.sort((a, b) => b.last_seen.localeCompare(a.last_seen));
  return { people, sessionsByPerson, personOfVid };
}

export function summarizePerson(id: string, list: SessionRecord[], linkLabels: Map<string, string>): PersonSummary {
  const latest = list[list.length - 1]!;
  const first = list[0]!;
  const vids = [...new Set(list.map((s) => s.vid))];
  const linkIds = [...new Set(list.map((s) => s.link_id).filter((x): x is string => !!x))];
  const tags = [...new Set(list.filter((s) => !s.link_id && s.ref_tag).map((s) => s.ref_tag!))];
  const label = list.map((s) => s.label).find(Boolean) ?? null;
  const linkLabel = linkIds.map((l) => linkLabels.get(l)).find(Boolean) ?? null;

  let name: string;
  let source: PersonSummary['name_source'];
  if (label) [name, source] = [label, 'label'];
  else if (linkLabel) [name, source] = [linkLabel, 'link'];
  else if (tags[0]) [name, source] = [tags[0], 'tag'];
  else [name, source] = [first.display_name ?? makeDisplayName(first.vid), 'pseudonym'];

  const located = [...list].reverse().find((s) => s.location);
  return {
    id,
    name,
    name_source: source,
    vids,
    link_ids: linkIds,
    tags,
    visits: list.length,
    visit_days: [...new Set(list.map((s) => dayKey(s.started_at)))],
    first_seen: first.started_at,
    last_seen: latest.ended_at && latest.ended_at > latest.started_at ? latest.ended_at : latest.started_at,
    active_seconds: list.reduce((n, s) => n + s.active_seconds, 0),
    top: mergeDwell(list.map((s) => s.sections), 4),
    location: located?.location ?? null,
    org: [...list].reverse().find((s) => s.org)?.org ?? null,
    ptr: [...list].reverse().find((s) => s.ptr)?.ptr ?? null,
    device: latest.device,
    is_bot: list.every((s) => s.is_bot),
    bot_reasons: list.find((s) => s.is_bot)?.bot_reasons ?? null,
    has_replay: list.some((s) => s.has_replay),
    referrer_host: list.find((s) => s.referrer_host)?.referrer_host ?? null,
  };
}

export async function loadLinks(db: Db) {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT id, slug, label, path, note, created_at, archived_at FROM links ORDER BY created_at DESC`,
  );
  return rows.map((r) => ({
    id: String(r.id),
    slug: String(r.slug),
    label: String(r.label),
    path: String(r.path ?? '/'),
    note: str(r.note),
    created_at: iso(r.created_at),
    archived: r.archived_at != null,
  }));
}

export function summarizeLinks(
  links: Awaited<ReturnType<typeof loadLinks>>,
  index: PeopleIndex,
): LinkSummary[] {
  return links.map((link) => {
    const people = index.people.filter((p) => p.link_ids.includes(link.id));
    const sessions = people
      .flatMap((p) => index.sessionsByPerson.get(p.id) ?? [])
      .filter((s) => s.link_id === link.id)
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
    const last = sessions[sessions.length - 1];
    return {
      ...link,
      opened: sessions.length > 0,
      people: people.length,
      person_ids: people.map((p) => p.id),
      visits: sessions.length,
      visit_days: [...new Set(sessions.map((s) => dayKey(s.started_at)))],
      first_opened_at: sessions[0]?.started_at ?? null,
      last_seen: last ? (last.ended_at && last.ended_at > last.started_at ? last.ended_at : last.started_at) : null,
      active_seconds: sessions.reduce((n, s) => n + s.active_seconds, 0),
      top: mergeDwell(sessions.map((s) => s.sections), 4),
      location: [...sessions].reverse().find((s) => s.location)?.location ?? null,
      device: last?.device ?? null,
    };
  });
}

/** Pairwise evidence between the visitor ids that make up one person. */
export async function personEvidence(db: Db, vids: string[], threshold: number): Promise<Array<Link & { from: string }>> {
  if (vids.length < 2) return [];
  const edges = await loadEdges(db);
  const out: Array<Link & { from: string }> = [];
  for (const vid of vids) {
    for (const link of resolveLinks(vid, edges, { threshold: Math.min(threshold, 0.3) })) {
      if (vids.includes(link.vid) && vid < link.vid) out.push({ ...link, from: vid });
    }
  }
  return out;
}

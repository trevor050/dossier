import type { Dwell } from '../protocol.js';

/** Validated, normalized collector payload. Every field is bounded. */
export type CollectInput = {
  vid: string;
  sid: string;
  scid: string | null;
  fpid: string | null;
  refTag: string | null;
  page: string | null;
  referrer: string | null;
  isMobile: boolean | null;
  orientation: 'portrait' | 'landscape' | null;
  events: Array<{ type: string; ts: Date; seq: number | null; data: Record<string, unknown> | null }>;
  summary: {
    sessionSeconds: number | null;
    activeSeconds: number | null;
    idleSeconds: number | null;
    interactions: number | null;
    firstInteractionSeconds: number | null;
    sections: Dwell[] | null;
    overlays: Dwell[] | null;
    overlaysUnique: number | null;
    pages: string[] | null;
    maxScrollPct: number | null;
  } | null;
  client: { webdriver: boolean; screen: string | null; tz: string | null; lang: string | null };
  internal: boolean;
};

export type ReplayInput = { vid: string; sid: string; chunkSeq: number | null; events: unknown[] };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const LIMITS = {
  collectBodyBytes: 64 * 1024,
  replayBodyBytes: 1024 * 1024,
  eventsPerRequest: 200,
  replayEventsPerRequest: 2000,
  eventDataBytes: 2048,
  dwellEntries: 60,
  pages: 50,
  maxSeconds: 60 * 60 * 24,
} as const;

const ID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const EVENT_TYPE_RE = /^[A-Za-z][A-Za-z0-9_:.-]{0,63}$/;
// Control characters are never legitimate in the strings we store.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function id(v: unknown): string | null {
  return typeof v === 'string' && ID_RE.test(v) ? v : null;
}

export function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.replace(CONTROL_RE, '').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function path(v: unknown): string | null {
  const s = cleanString(v, 500);
  if (!s) return null;
  if (s.startsWith('/')) return s;
  // Accept full URLs but keep only path + query.
  try {
    const u = new URL(s);
    return (u.pathname + u.search).slice(0, 500);
  } catch {
    return null;
  }
}

function httpUrl(v: unknown, max: number): string | null {
  const s = cleanString(v, max);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s : null;
  } catch {
    return null;
  }
}

function dwellList(v: unknown): Dwell[] | null {
  if (!Array.isArray(v)) return null;
  const out: Dwell[] = [];
  for (const item of v.slice(0, LIMITS.dwellEntries)) {
    if (!isObject(item)) continue;
    const key = cleanString(item.key, 80);
    const seconds = int(item.seconds, 0, LIMITS.maxSeconds);
    if (key && seconds != null) out.push({ key, seconds });
  }
  return out;
}

/** Parse event `data`, dropping anything that is not a small plain object. */
function eventData(v: unknown): Record<string, unknown> | null {
  if (!isObject(v)) return null;
  let encoded: string;
  try {
    encoded = JSON.stringify(v);
  } catch {
    return null;
  }
  if (encoded.length > LIMITS.eventDataBytes) return { truncated: true };
  return JSON.parse(encoded.replace(/\\u0000/g, '')) as Record<string, unknown>;
}

function eventTs(v: unknown, now: number): Date {
  if (typeof v === 'string') {
    const t = Date.parse(v);
    // Accept client clocks within a day in the past / five minutes in the future.
    if (Number.isFinite(t) && t > now - 86_400_000 && t < now + 300_000) return new Date(t);
  }
  return new Date(now);
}

export function parseCollect(body: unknown, now = Date.now()): Result<CollectInput> {
  if (!isObject(body)) return { ok: false, error: 'body must be an object' };
  const vid = id(body.vid);
  const sid = id(body.sid);
  if (!vid || !sid) return { ok: false, error: 'vid and sid are required' };

  const rawEvents = Array.isArray(body.events) ? body.events : [];
  if (rawEvents.length > LIMITS.eventsPerRequest) return { ok: false, error: 'too many events' };
  const events: CollectInput['events'] = [];
  for (const e of rawEvents) {
    if (!isObject(e) || typeof e.type !== 'string' || !EVENT_TYPE_RE.test(e.type)) continue;
    events.push({
      type: e.type,
      ts: eventTs(e.ts, now),
      seq: int(e.seq, 0, 2_000_000_000),
      data: eventData(e.data),
    });
  }

  let summary: CollectInput['summary'] = null;
  if (isObject(body.summary)) {
    const s = body.summary;
    summary = {
      sessionSeconds: int(s.session_seconds, 0, LIMITS.maxSeconds),
      activeSeconds: int(s.active_seconds, 0, LIMITS.maxSeconds),
      idleSeconds: int(s.idle_seconds, 0, LIMITS.maxSeconds),
      interactions: int(s.interactions, 0, 1_000_000),
      firstInteractionSeconds: int(s.first_interaction_seconds, 0, LIMITS.maxSeconds),
      sections: dwellList(s.sections),
      overlays: dwellList(s.overlays),
      overlaysUnique: int(s.overlays_unique, 0, 10_000),
      pages: Array.isArray(s.pages)
        ? s.pages.slice(0, LIMITS.pages).map(path).filter((p): p is string => p != null)
        : null,
      maxScrollPct: int(s.max_scroll_pct, 0, 100),
    };
  }

  const c = isObject(body.client) ? body.client : {};
  return {
    ok: true,
    value: {
      vid,
      sid,
      scid: id(body.scid),
      fpid: id(body.fpid),
      refTag: cleanString(body.ref_tag, 120),
      page: path(body.page),
      referrer: httpUrl(body.referrer, 1000),
      isMobile: typeof body.is_mobile === 'boolean' ? body.is_mobile : null,
      orientation: body.orientation === 'portrait' || body.orientation === 'landscape' ? body.orientation : null,
      events,
      summary,
      client: {
        webdriver: c.webdriver === true,
        screen: typeof c.screen === 'string' && /^\d{1,5}x\d{1,5}$/.test(c.screen) ? c.screen : null,
        tz: cleanString(c.tz, 64),
        lang: cleanString(c.lang, 35),
      },
      internal: body.internal === true,
    },
  };
}

export function parseReplay(body: unknown): Result<ReplayInput> {
  if (!isObject(body)) return { ok: false, error: 'body must be an object' };
  const vid = id(body.vid);
  const sid = id(body.sid);
  if (!vid || !sid) return { ok: false, error: 'vid and sid are required' };
  if (!Array.isArray(body.events)) return { ok: false, error: 'events must be an array' };
  if (body.events.length > LIMITS.replayEventsPerRequest) return { ok: false, error: 'too many replay events' };
  // rrweb events are objects with a numeric `type` and `timestamp`; drop anything else.
  const events = body.events.filter(
    (e) => isObject(e) && typeof e.type === 'number' && typeof e.timestamp === 'number',
  );
  return { ok: true, value: { vid, sid, chunkSeq: int(body.chunk_seq, 0, 1_000_000), events } };
}

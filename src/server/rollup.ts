import type { Dwell } from '../protocol.js';

/**
 * Session summaries are reported per page load. Each page load ("page view")
 * sends cumulative numbers for itself, so the latest summary for a page view
 * replaces earlier ones, and the session is the sum over its page views.
 *
 * The collector stores one row per (sid, pageview_id) keeping the highest
 * `seq`, and readers roll the rows up with `rollupPageViews`. Nothing is ever
 * added to a running total, so retries, duplicate pagehide posts and
 * out-of-order heartbeats cannot double count.
 */

/** Stored shape of one page view's latest summary (snake_case, as on the wire). */
export type PageViewSummary = {
  active_seconds?: number | null;
  idle_seconds?: number | null;
  session_seconds?: number | null;
  interactions?: number | null;
  first_interaction_seconds?: number | null;
  sections?: Dwell[] | null;
  overlays?: Dwell[] | null;
  pages?: string[] | null;
  max_scroll_pct?: number | null;
};

export type PageViewRow = {
  pvid: string;
  started_at: Date | string;
  page: string | null;
  summary: PageViewSummary;
};

export type SessionRollup = {
  active_seconds: number;
  idle_seconds: number;
  session_seconds: number;
  interactions: number;
  first_interaction_seconds: number | null;
  sections: Dwell[];
  pages: string[];
  max_scroll_pct: number | null;
};

/** Page views without an id (trackers before 0.2.1) share this key: last write wins, as before. */
export const LEGACY_PAGEVIEW = '_legacy';

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function mergeDwell(lists: Dwell[][], limit = Infinity): Dwell[] {
  const total = new Map<string, number>();
  for (const list of lists) for (const d of list) total.set(d.key, (total.get(d.key) ?? 0) + d.seconds);
  return [...total.entries()]
    .map(([key, seconds]) => ({ key, seconds }))
    .filter((d) => d.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds || a.key.localeCompare(b.key))
    .slice(0, limit);
}

export function rollupPageViews(rows: PageViewRow[]): SessionRollup {
  const ordered = [...rows].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime() || a.pvid.localeCompare(b.pvid),
  );
  const start = ordered.length ? new Date(ordered[0]!.started_at).getTime() : 0;

  const pages: string[] = [];
  let firstInteraction: number | null = null;
  let maxScroll: number | null = null;
  for (const row of ordered) {
    const s = row.summary;
    const list = s.pages?.length ? s.pages : row.page ? [row.page] : [];
    for (const p of list) if (pages[pages.length - 1] !== p) pages.push(p);
    if (firstInteraction == null && typeof s.first_interaction_seconds === 'number') {
      // Express it relative to the start of the session, not of this page.
      firstInteraction = Math.round((new Date(row.started_at).getTime() - start) / 1000) + s.first_interaction_seconds;
    }
    if (typeof s.max_scroll_pct === 'number') maxScroll = Math.max(maxScroll ?? 0, s.max_scroll_pct);
  }

  return {
    active_seconds: ordered.reduce((t, r) => t + n(r.summary.active_seconds), 0),
    idle_seconds: ordered.reduce((t, r) => t + n(r.summary.idle_seconds), 0),
    session_seconds: ordered.reduce((t, r) => t + n(r.summary.session_seconds), 0),
    interactions: ordered.reduce((t, r) => t + n(r.summary.interactions), 0),
    first_interaction_seconds: firstInteraction,
    sections: mergeDwell(ordered.map((r) => [...(r.summary.sections ?? []), ...(r.summary.overlays ?? [])])),
    pages,
    max_scroll_pct: maxScroll,
  };
}

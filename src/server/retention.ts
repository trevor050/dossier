import type { Db } from './db.js';
import { nodeFp, nodeIpUa, nodeScid, nodeVid } from './identity.js';

export type Settings = {
  retention_human_days: number;
  retention_bot_days: number;
  retention_replay_days: number;
};

export const DEFAULT_SETTINGS: Settings = {
  retention_human_days: 365,
  retention_bot_days: 30,
  retention_replay_days: 30,
};

const BOUNDS: Record<keyof Settings, [number, number]> = {
  retention_human_days: [1, 3650],
  retention_bot_days: [1, 365],
  retention_replay_days: [1, 365],
};

function bounded(key: keyof Settings, value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  const [min, max] = BOUNDS[key];
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function getSettings(db: Db): Promise<Settings> {
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT retention_human_days, retention_bot_days, retention_replay_days FROM tracker_settings WHERE id = 1`,
  );
  const row = rows[0] ?? {};
  return {
    retention_human_days: bounded('retention_human_days', row.retention_human_days, DEFAULT_SETTINGS.retention_human_days),
    retention_bot_days: bounded('retention_bot_days', row.retention_bot_days, DEFAULT_SETTINGS.retention_bot_days),
    retention_replay_days: bounded('retention_replay_days', row.retention_replay_days, DEFAULT_SETTINGS.retention_replay_days),
  };
}

export async function updateSettings(db: Db, patch: Partial<Record<keyof Settings, unknown>>): Promise<Settings> {
  const current = await getSettings(db);
  const next: Settings = {
    retention_human_days: bounded('retention_human_days', patch.retention_human_days, current.retention_human_days),
    retention_bot_days: bounded('retention_bot_days', patch.retention_bot_days, current.retention_bot_days),
    retention_replay_days: bounded('retention_replay_days', patch.retention_replay_days, current.retention_replay_days),
  };
  await db.query(
    `INSERT INTO tracker_settings (id, retention_human_days, retention_bot_days, retention_replay_days, updated_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       retention_human_days = EXCLUDED.retention_human_days,
       retention_bot_days = EXCLUDED.retention_bot_days,
       retention_replay_days = EXCLUDED.retention_replay_days,
       updated_at = NOW()`,
    [next.retention_human_days, next.retention_bot_days, next.retention_replay_days],
  );
  return next;
}

export type PruneResult = {
  sessions: number;
  replay_chunks: number;
  visitors: number;
  identity_edges: number;
  cache_rows: number;
};

async function count(db: Db, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.query<{ n: number }>(`WITH d AS (${sql} RETURNING 1) SELECT COUNT(*)::int AS n FROM d`, params);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Delete everything older than the configured retention windows. `batch` bounds
 * the work so it can run opportunistically inside a request.
 */
export async function pruneExpired(db: Db, settings: Settings, batch = 1000): Promise<PruneResult> {
  const sessions =
    (await count(
      db,
      `DELETE FROM sessions WHERE sid IN (
         SELECT sid FROM sessions
          WHERE COALESCE(is_bot, false) = false AND started_at < NOW() - ($1::int * INTERVAL '1 day')
          ORDER BY started_at LIMIT $2)`,
      [settings.retention_human_days, batch],
    )) +
    (await count(
      db,
      `DELETE FROM sessions WHERE sid IN (
         SELECT sid FROM sessions
          WHERE COALESCE(is_bot, false) = true AND started_at < NOW() - ($1::int * INTERVAL '1 day')
          ORDER BY started_at LIMIT $2)`,
      [settings.retention_bot_days, batch],
    ));

  const replay_chunks = await count(
    db,
    `DELETE FROM replay_events WHERE id IN (
       SELECT id FROM replay_events WHERE ts < NOW() - ($1::int * INTERVAL '1 day') ORDER BY id LIMIT $2)`,
    [settings.retention_replay_days, batch * 5],
  );

  const visitors = await count(
    db,
    `DELETE FROM visitors v WHERE v.vid IN (
       SELECT vid FROM visitors x
        WHERE x.last_seen_at < NOW() - INTERVAL '1 day'
          AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.vid = x.vid)
        LIMIT $1)`,
    [batch],
  );

  const identity_edges = await count(
    db,
    `DELETE FROM identity_edges
      WHERE last_seen_at < NOW() - ($1::int * INTERVAL '1 day')
         OR weight * EXP(-decay_lambda * EXTRACT(EPOCH FROM (NOW() - last_seen_at))) < 0.001`,
    [settings.retention_human_days],
  );

  let cache_rows = 0;
  for (const table of ['ipinfo_cache', 'ptr_cache', 'freeip_cache']) {
    cache_rows += await count(
      db,
      `DELETE FROM ${table} WHERE COALESCE(fetched_at, error_at, NOW()) < NOW() - INTERVAL '30 days'`,
      [],
    );
  }

  return { sessions, replay_chunks, visitors, identity_edges, cache_rows };
}

/**
 * Permanently delete visitors and everything derived from them: sessions,
 * events, replays, IP history, identity edges and cached IP lookups that no
 * remaining session uses.
 */
export async function deleteVisitors(db: Db, vids: string[]): Promise<{ visitors: number; sessions: number }> {
  if (!vids.length) return { visitors: 0, sessions: 0 };
  const { rows: sessions } = await db.query<{
    sid: string;
    ip: string | null;
    user_agent: string | null;
    session_cookie_id: string | null;
    fingerprint_id: string | null;
  }>(`SELECT sid, ip, user_agent, session_cookie_id, fingerprint_id FROM sessions WHERE vid = ANY($1::text[])`, [vids]);
  const { rows: ipRows } = await db.query<{ ip: string }>(
    `SELECT DISTINCT si.ip FROM session_ips si JOIN sessions s ON s.sid = si.sid WHERE s.vid = ANY($1::text[])`,
    [vids],
  );

  const nodes = new Set<string>(vids.map(nodeVid));
  for (const s of sessions) {
    if (s.session_cookie_id) nodes.add(nodeScid(s.session_cookie_id));
    if (s.fingerprint_id) nodes.add(nodeFp(s.fingerprint_id));
    if (s.ip && s.user_agent) nodes.add(nodeIpUa(s.ip, s.user_agent));
  }
  const ips = new Set<string>(ipRows.map((r) => r.ip));
  for (const s of sessions) if (s.ip) ips.add(s.ip);

  await db.query(`DELETE FROM identity_edges WHERE a = ANY($1::text[]) OR b = ANY($1::text[])`, [[...nodes]]);
  const removed = await count(db, `DELETE FROM visitors WHERE vid = ANY($1::text[])`, [vids]);

  if (ips.size) {
    const list = [...ips];
    for (const table of ['ipinfo_cache', 'ptr_cache', 'freeip_cache']) {
      await db.query(
        `DELETE FROM ${table} c WHERE c.ip = ANY($1::text[])
           AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.ip = c.ip)
           AND NOT EXISTS (SELECT 1 FROM session_ips si WHERE si.ip = c.ip)`,
        [list],
      );
    }
  }
  return { visitors: removed, sessions: sessions.length };
}

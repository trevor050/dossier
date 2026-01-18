import { requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { query, getPool } from '../../server/db.js';
import { safeHostFromUrl } from '../../server/http.js';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export default async function handler(req: any, res: any) {
  if (!requireAdmin(req, res)) return;

  if (!getPool()) {
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
    return;
  }

  await ensureSchema();

  const now = new Date();
  const d1 = daysAgo(1).toISOString();
  const d7 = daysAgo(7).toISOString();
  const d30 = daysAgo(30).toISOString();
  const d60 = daysAgo(60).toISOString();
  const d365 = daysAgo(365).toISOString();

  const totalsRes = await query<any>(
    `
      SELECT
        (SELECT COUNT(*)::int FROM visitors) AS visitors,
        (SELECT COUNT(*)::int FROM sessions) AS sessions,
        (SELECT COUNT(*)::int FROM events) AS events,
        (SELECT COUNT(*)::int FROM sessions WHERE COALESCE(is_bot,false)=false) AS sessions_human
    `
  );

  const dauRes = await query<any>(
    `SELECT COUNT(DISTINCT vid)::int AS dau FROM sessions WHERE started_at >= $1 AND COALESCE(is_bot,false)=false`,
    [d1]
  );
  const wauRes = await query<any>(
    `SELECT COUNT(DISTINCT vid)::int AS wau FROM sessions WHERE started_at >= $1 AND COALESCE(is_bot,false)=false`,
    [d7]
  );
  const mauRes = await query<any>(
    `SELECT COUNT(DISTINCT vid)::int AS mau FROM sessions WHERE started_at >= $1 AND COALESCE(is_bot,false)=false`,
    [d30]
  );

  const returningRes = await query<any>(
    `
      SELECT COUNT(*)::int AS returning_visitors
      FROM (
        SELECT vid
        FROM sessions
        WHERE started_at >= $1 AND COALESCE(is_bot,false)=false
        GROUP BY vid
        HAVING COUNT(*) >= 2
      ) t
    `,
    [d30]
  );

  const referrersRes = await query<any>(
    `
      SELECT referrer, COUNT(*)::int AS sessions
      FROM sessions
      WHERE started_at >= $1 AND COALESCE(is_bot,false)=false AND referrer IS NOT NULL AND referrer <> ''
      GROUP BY referrer
      ORDER BY sessions DESC
      LIMIT 20
    `,
    [d30]
  );

  const referrers = referrersRes.rows.map((r: any) => {
    const host = safeHostFromUrl(r.referrer ?? undefined);
    return { host: host ?? r.referrer, sessions: r.sessions };
  });

  const pagesRes = await query<any>(
    `
      SELECT page, COUNT(*)::int AS sessions
      FROM sessions
      WHERE started_at >= $1 AND COALESCE(is_bot,false)=false AND page IS NOT NULL AND page <> ''
      GROUP BY page
      ORDER BY sessions DESC
      LIMIT 20
    `,
    [d30]
  );

  const overlaysRes = await query<any>(
    `
      SELECT
        e.data->>'overlay' AS overlay,
        COUNT(*)::int AS opens
      FROM events e
      JOIN sessions s ON s.sid = e.sid
      WHERE e.type = 'open_overlay' AND e.ts >= $1 AND COALESCE(s.is_bot,false)=false
      GROUP BY overlay
      ORDER BY opens DESC
      LIMIT 20
    `,
    [d30]
  );

  const overlayDwellRes = await query<any>(
    `
      SELECT
        e.data->>'overlay' AS overlay,
        SUM(COALESCE((e.data->>'dwell_s')::numeric, 0))::float AS dwell_s
      FROM events e
      JOIN sessions s ON s.sid = e.sid
      WHERE e.type = 'close_overlay' AND e.ts >= $1 AND COALESCE(s.is_bot,false)=false
      GROUP BY overlay
      ORDER BY dwell_s DESC
      LIMIT 20
    `,
    [d30]
  );

  const byDayRes = await query<any>(
    `
      SELECT
        to_char(date_trunc('day', started_at), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS sessions,
        COUNT(DISTINCT vid)::int AS visitors
      FROM sessions
      WHERE started_at >= $1 AND COALESCE(is_bot,false)=false
      GROUP BY day
      ORDER BY day ASC
      LIMIT 365
    `,
    [d365]
  );

  const currRes = await query<any>(
    `
      SELECT
        COUNT(*)::int AS sessions,
        COUNT(DISTINCT vid)::int AS visitors
      FROM sessions
      WHERE started_at >= $1 AND COALESCE(is_bot,false)=false
    `,
    [d30]
  );
  const prevRes = await query<any>(
    `
      SELECT
        COUNT(*)::int AS sessions,
        COUNT(DISTINCT vid)::int AS visitors
      FROM sessions
      WHERE started_at >= $1 AND started_at < $2 AND COALESCE(is_bot,false)=false
    `,
    [d60, d30]
  );

  const curr = currRes.rows[0] ?? { sessions: 0, visitors: 0 };
  const prev = prevRes.rows[0] ?? { sessions: 0, visitors: 0 };
  const pct = (c: number, p: number) => (p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null);

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      generated_at: now.toISOString(),
      totals: totalsRes.rows[0] ?? {},
      dau: dauRes.rows[0]?.dau ?? 0,
      wau: wauRes.rows[0]?.wau ?? 0,
      mau: mauRes.rows[0]?.mau ?? 0,
      returning_visitors_30d: returningRes.rows[0]?.returning_visitors ?? 0,
      top_referrers_30d: referrers,
      top_pages_30d: pagesRes.rows,
      top_overlays_open_30d: overlaysRes.rows,
      top_overlays_dwell_30d: overlayDwellRes.rows,
      by_day_365d: byDayRes.rows,
      period_30d: {
        sessions: curr.sessions ?? 0,
        visitors: curr.visitors ?? 0,
        sessions_prev: prev.sessions ?? 0,
        visitors_prev: prev.visitors ?? 0,
        sessions_change_pct: pct(curr.sessions ?? 0, prev.sessions ?? 0),
        visitors_change_pct: pct(curr.visitors ?? 0, prev.visitors ?? 0),
      },
    })
  );
}

import { requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { query, getPool } from '../../server/db.js';
import { makeDisplayName } from '../../server/names.js';

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
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

  const url = new URL(req.url, `http://${req.headers.host}`);
  const includeBots = url.searchParams.get('bots') === '1';

  // Latest human session per visitor, for mapping.
  const humansRes = await query<any>(
    `
      SELECT DISTINCT ON (s.vid)
        s.vid,
        v.display_name,
        s.sid,
        s.started_at,
        s.ip,
        s.ptr,
        s.geo,
        s.ipinfo,
        COALESCE(s.is_bot,false) AS is_bot,
        s.bot_score,
        s.bot_reasons,
        (SELECT COUNT(*)::int FROM sessions sx WHERE sx.vid = s.vid AND COALESCE(sx.is_bot,false)=false) AS sessions
      FROM sessions s
      JOIN visitors v ON v.vid = s.vid
      WHERE COALESCE(s.is_bot,false)=false
      ORDER BY s.vid, s.started_at DESC
      LIMIT 500
    `
  );

  let botRows: any[] = [];
  if (includeBots) {
    const botsRes = await query<any>(
      `
        SELECT DISTINCT ON (s.vid)
          s.vid,
          v.display_name,
          s.sid,
          s.started_at,
          s.ip,
          s.ptr,
          s.geo,
          COALESCE(s.is_bot,false) AS is_bot,
          s.bot_score,
          s.bot_reasons,
          (SELECT COUNT(*)::int FROM sessions sx WHERE sx.vid = s.vid AND COALESCE(sx.is_bot,false)=true) AS sessions
        FROM sessions s
        JOIN visitors v ON v.vid = s.vid
        WHERE COALESCE(s.is_bot,false)=true
          AND NOT EXISTS (
            SELECT 1 FROM sessions sh WHERE sh.vid = s.vid AND COALESCE(sh.is_bot,false)=false
          )
        ORDER BY s.vid, s.started_at DESC
        LIMIT 500
      `
    );
    botRows = botsRes.rows ?? [];
  }

  const rows = [...(humansRes.rows ?? []), ...botRows];

  const points = rows
    .map((r: any) => {
      const geo = r.geo ?? {};
      const ipinfo = r.ipinfo ?? {};
      const lat = num(geo.latitude);
      const lon = num(geo.longitude);
      if (lat == null || lon == null) return null;
      return {
        vid: r.vid,
        display_name: r.display_name ?? makeDisplayName(r.vid),
        sid: r.sid,
        started_at: r.started_at,
        ip: r.ip ?? null,
        ptr: r.ptr ?? null,
        sessions: r.sessions ?? 0,
        is_bot: Boolean(r.is_bot),
        bot_score: r.bot_score ?? null,
        bot_reasons: r.bot_reasons ?? null,
        city: geo.city ?? ipinfo.city ?? null,
        region: geo.region ?? ipinfo.region ?? null,
        country: geo.country ?? ipinfo.country ?? null,
        org: ipinfo.org ?? ipinfo.company?.name ?? null,
        lat,
        lon,
      };
    })
    .filter(Boolean);

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ points }));
}

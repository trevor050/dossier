import { requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { query, getPool } from '../../server/db.js';
import { makeDisplayName } from '../../server/names.js';
import { createHash } from 'node:crypto';

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

  const { rows } = await query<any>(
    `
      SELECT
        v.vid,
        v.display_name,
        v.first_seen_at,
        v.last_seen_at,
        v.first_ip,
        v.last_ip,
        v.ptr,
        v.ipinfo,
        v.last_ref_tag,
        v.last_fingerprint_id,
        COUNT(s.sid) AS sessions,
        COUNT(*) FILTER (WHERE COALESCE(s.is_bot,false)=false) AS sessions_human,
        COUNT(*) FILTER (WHERE COALESCE(s.is_bot,false)=true) AS sessions_bot,
        MAX(s.started_at) AS last_session_at,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.session_cookie_id) FILTER (WHERE s.session_cookie_id IS NOT NULL AND s.session_cookie_id <> ''), NULL) AS session_cookies,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT s.fingerprint_id) FILTER (WHERE s.fingerprint_id IS NOT NULL AND s.fingerprint_id <> ''), NULL) AS fingerprints,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT si.ip) FILTER (WHERE si.ip IS NOT NULL AND si.ip <> ''), NULL) AS ips
      FROM visitors v
      LEFT JOIN sessions s ON s.vid = v.vid
      LEFT JOIN session_ips si ON si.sid = s.sid
      GROUP BY v.vid
      HAVING ($1::boolean = true OR COUNT(*) FILTER (WHERE COALESCE(s.is_bot,false)=false) > 0)
      ORDER BY v.last_seen_at DESC
      LIMIT 250
    `,
    [includeBots]
  );

  const temp = rows.map((v: any) => {
    const ipinfo = v.ipinfo ?? {};
    const displayName = v.display_name ?? makeDisplayName(v.vid);
    const scids = Array.isArray(v.session_cookies) ? v.session_cookies.filter(Boolean) : [];
    const fpids = Array.isArray(v.fingerprints) ? v.fingerprints.filter(Boolean) : [];
    const ips = Array.isArray(v.ips) ? v.ips.filter(Boolean) : [];
    const tokens = [...scids.map((s: string) => `scid:${s}`), ...ips.map((i: string) => `ip:${i}`), ...fpids.map((f: string) => `fp:${f}`)];
    const rawKey = tokens.length ? tokens.sort().join('|') : `vid:${v.vid}`;
    const groupId = createHash('sha1').update(rawKey).digest('hex').slice(0, 12);
    return {
      vid: v.vid,
      display_name: displayName,
      cluster_id: groupId,
      first_seen_at: v.first_seen_at,
      last_seen_at: v.last_seen_at,
      first_ip: v.first_ip,
      last_ip: v.last_ip,
      ptr: v.ptr ?? null,
      sessions: typeof v.sessions === 'string' ? Number(v.sessions) : v.sessions ?? 0,
      sessions_human:
        typeof v.sessions_human === 'string' ? Number(v.sessions_human) : v.sessions_human ?? 0,
      sessions_bot:
        typeof v.sessions_bot === 'string' ? Number(v.sessions_bot) : v.sessions_bot ?? 0,
      last_session_at: v.last_session_at ?? null,
      last_ref_tag: v.last_ref_tag ?? null,
      last_fingerprint_id: v.last_fingerprint_id ?? null,
      city: ipinfo.city ?? null,
      region: ipinfo.region ?? null,
      country: ipinfo.country ?? null,
      org: ipinfo.org ?? ipinfo.company?.name ?? null,
    };
  });

  const groupIds = Array.from(new Set(temp.map((v: any) => v.cluster_id)));
  const groupMap = new Map<string, string>();
  if (groupIds.length) {
    const groupRes = await query<any>(
      `SELECT group_id, display_name FROM visitor_groups WHERE group_id = ANY($1::text[])`,
      [groupIds]
    );
    for (const row of groupRes.rows) groupMap.set(row.group_id, row.display_name);
  }

  const visitors = temp.map((v: any) => ({
    ...v,
    cluster_name: groupMap.get(v.cluster_id) ?? makeDisplayName(v.cluster_id),
  }));

  // Opportunistic backfill for older rows (best-effort).
  for (const v of rows) {
    if (!v?.vid) continue;
    if (v.display_name == null) {
      const dn = makeDisplayName(v.vid);
      // Fire and forget; if it fails, it's fine.
      void query(`UPDATE visitors SET display_name = $2 WHERE vid = $1 AND display_name IS NULL`, [v.vid, dn]).catch(() => {});
    }
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ visitors }));
}

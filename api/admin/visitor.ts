import { requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { query, getPool } from '../../server/db.js';
import { makeDisplayName } from '../../server/names.js';
import { readRawBody, safeHostFromUrl } from '../../server/http.js';
import { createHash } from 'node:crypto';

function clampString(value: unknown, max = 200): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
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

  if (req.method === 'POST') {
    const raw = await readRawBody(req, 25_000);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    const vid = clampString(body?.vid, 128);
    const displayName = clampString(body?.display_name, 80);
    const clusterId = clampString(body?.cluster_id, 128);
    const clusterName = clampString(body?.cluster_name, 80);

    if (!vid && !clusterId) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing vid or cluster_id' }));
      return;
    }

    if (vid) {
      await query(`UPDATE visitors SET display_name = $2 WHERE vid = $1`, [vid, displayName]);
    }
    if (clusterId) {
      await query(
        `
          INSERT INTO visitor_groups (group_id, display_name, updated_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (group_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = NOW()
        `,
        [clusterId, clusterName]
      );
    }
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.end('Method Not Allowed');
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const vid = url.searchParams.get('vid');
  if (!vid || vid.length > 128) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing vid' }));
    return;
  }

  const visitorRes = await query<any>(
    `
      SELECT
        vid,
        display_name,
        first_seen_at,
        last_seen_at,
        first_ip,
        last_ip,
        ptr,
        ipinfo
      FROM visitors
      WHERE vid = $1
      LIMIT 1
    `,
    [vid]
  );
  const visitorRow = visitorRes.rows[0];
  if (!visitorRow) {
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const sessionsRes = await query<any>(
    `
      SELECT
        sid,
        started_at,
        ended_at,
        ip,
        ptr,
        is_bot,
        bot_score,
        bot_reasons,
        is_mobile,
        orientation,
        page,
        referrer,
        ref_tag,
        geo,
        ipinfo,
        session_cookie_id,
        fingerprint_id,
        active_seconds,
        idle_seconds,
        session_seconds,
        interactions,
        overlays_unique
      FROM sessions
      WHERE vid = $1
      ORDER BY started_at DESC
      LIMIT 200
    `,
    [vid]
  );

  const ipinfo = visitorRow.ipinfo ?? {};
  const visitor = {
    vid: visitorRow.vid,
    display_name: visitorRow.display_name ?? makeDisplayName(visitorRow.vid),
    first_seen_at: visitorRow.first_seen_at,
    last_seen_at: visitorRow.last_seen_at,
    first_ip: visitorRow.first_ip,
    last_ip: visitorRow.last_ip,
    ptr: visitorRow.ptr ?? null,
    city: ipinfo.city ?? null,
    region: ipinfo.region ?? null,
    country: ipinfo.country ?? null,
    org: ipinfo.org ?? ipinfo.company?.name ?? null,
  };

  const sessions = sessionsRes.rows.map((s: any) => {
    const geo = s.geo ?? {};
    const ipinfoS = s.ipinfo ?? {};
    return {
      sid: s.sid,
      started_at: s.started_at,
      ended_at: s.ended_at,
      ip: s.ip,
      ptr: s.ptr ?? null,
      is_bot: s.is_bot,
      bot_score: s.bot_score,
      bot_reasons: s.bot_reasons,
      is_mobile: s.is_mobile,
      orientation: s.orientation,
      page: s.page ?? null,
      referrer: s.referrer ?? null,
      ref_tag: s.ref_tag ?? null,
      city: geo.city ?? null,
      region: geo.region ?? null,
      country: geo.country ?? null,
      latitude: geo.latitude ?? null,
      longitude: geo.longitude ?? null,
      org: ipinfoS.org ?? ipinfoS.company?.name ?? null,
      session_cookie_id: s.session_cookie_id ?? null,
      fingerprint_id: s.fingerprint_id ?? null,
      active_seconds: s.active_seconds,
      idle_seconds: s.idle_seconds,
      session_seconds: s.session_seconds,
      interactions: s.interactions,
      overlays_unique: s.overlays_unique,
    };
  });

  const cookieRes = await query<any>(
    `
      SELECT DISTINCT session_cookie_id
      FROM sessions
      WHERE vid = $1 AND session_cookie_id IS NOT NULL AND session_cookie_id <> ''
      LIMIT 50
    `,
    [vid]
  );
  const scids = cookieRes.rows.map((r: any) => r.session_cookie_id).filter(Boolean);

  const fpidRes = await query<any>(
    `
      SELECT DISTINCT fingerprint_id
      FROM sessions
      WHERE vid = $1 AND fingerprint_id IS NOT NULL AND fingerprint_id <> ''
      LIMIT 50
    `,
    [vid]
  );
  const fpids = fpidRes.rows.map((r: any) => r.fingerprint_id).filter(Boolean);

  const refTagRes = await query<any>(
    `
      SELECT DISTINCT ref_tag
      FROM sessions
      WHERE vid = $1 AND ref_tag IS NOT NULL AND ref_tag <> ''
      LIMIT 30
    `,
    [vid]
  );
  const refTags = refTagRes.rows.map((r: any) => r.ref_tag).filter(Boolean);

  const refHostRes = await query<any>(
    `
      SELECT DISTINCT referrer
      FROM sessions
      WHERE vid = $1 AND referrer IS NOT NULL AND referrer <> ''
      LIMIT 30
    `,
    [vid]
  );
  const refHosts = refHostRes.rows
    .map((r: any) => safeHostFromUrl(r.referrer ?? undefined) ?? r.referrer)
    .filter(Boolean);

  const ipRes = await query<any>(
    `
      SELECT DISTINCT ip
      FROM session_ips
      WHERE sid IN (SELECT sid FROM sessions WHERE vid = $1)
      LIMIT 100
    `,
    [vid]
  );
  const ips = ipRes.rows.map((r: any) => r.ip).filter(Boolean);

  const tokens = [
    ...scids.map((s: string) => `scid:${s}`),
    ...ips.map((i: string) => `ip:${i}`),
    ...fpids.map((f: string) => `fp:${f}`),
  ];
  const rawKey = tokens.length ? tokens.sort().join('|') : `vid:${vid}`;
  const groupId = createHash('sha1').update(rawKey).digest('hex').slice(0, 12);

  const groupRes = await query<any>(`SELECT display_name FROM visitor_groups WHERE group_id = $1 LIMIT 1`, [groupId]);
  let groupName = groupRes.rows[0]?.display_name ?? null;
  if (!groupName) {
    groupName = makeDisplayName(groupId);
    await query(
      `
        INSERT INTO visitor_groups (group_id, display_name, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (group_id) DO NOTHING
      `,
      [groupId, groupName]
    );
  }

  const relatedRes = await query<any>(
    `
      SELECT
        s.vid,
        v.display_name,
        v.last_seen_at,
        v.last_ip,
        v.ptr,
        v.ipinfo,
        BOOL_OR(s.session_cookie_id = ANY($2::text[])) AS shared_cookie,
        BOOL_OR(s.ip = ANY($3::text[])) AS shared_ip,
        BOOL_OR(s.fingerprint_id = ANY($4::text[])) AS shared_fingerprint
      FROM sessions s
      JOIN visitors v ON v.vid = s.vid
      WHERE s.vid <> $1
        AND (s.session_cookie_id = ANY($2::text[]) OR s.ip = ANY($3::text[]) OR s.fingerprint_id = ANY($4::text[]))
      GROUP BY s.vid, v.display_name, v.last_seen_at, v.last_ip, v.ptr, v.ipinfo
      ORDER BY v.last_seen_at DESC
      LIMIT 60
    `,
    [vid, scids, ips, fpids]
  );

  const related = relatedRes.rows.map((r: any) => {
    const ipinfoR = r.ipinfo ?? {};
    return {
      vid: r.vid,
      display_name: r.display_name ?? makeDisplayName(r.vid),
      last_seen_at: r.last_seen_at,
      last_ip: r.last_ip,
      ptr: r.ptr ?? null,
      city: ipinfoR.city ?? null,
      region: ipinfoR.region ?? null,
      country: ipinfoR.country ?? null,
      org: ipinfoR.org ?? ipinfoR.company?.name ?? null,
      shared_cookie: Boolean(r.shared_cookie),
      shared_ip: Boolean(r.shared_ip),
      shared_fingerprint: Boolean(r.shared_fingerprint),
    };
  });

  const statsRes = await query<any>(
    `
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(is_bot,false)=false) AS sessions_human,
        COUNT(*) FILTER (WHERE COALESCE(is_bot,false)=true) AS sessions_bot,
        AVG(
          CASE
            WHEN COALESCE(is_bot,false)=false THEN
              COALESCE(session_seconds, EXTRACT(EPOCH FROM (ended_at - started_at)))
            ELSE NULL
          END
        )::float AS avg_session_seconds,
        AVG(
          CASE
            WHEN COALESCE(is_bot,false)=false THEN COALESCE(interactions,0)
            ELSE NULL
          END
        )::float AS avg_actions,
        SUM(
          CASE
            WHEN COALESCE(is_bot,false)=false THEN COALESCE(interactions,0)
            ELSE 0
          END
        )::int AS total_actions
      FROM sessions
      WHERE vid = $1
    `,
    [vid]
  );
  const stats = statsRes.rows[0] ?? {};

  const actionRes = await query<any>(
    `
      SELECT
        e.type,
        COALESCE(e.data->>'target', e.data->>'overlay', e.data->>'path', e.type) AS label,
        COUNT(*)::int AS count
      FROM events e
      JOIN sessions s ON s.sid = e.sid
      WHERE s.vid = $1
        AND e.type IN ('click_target','click_link','open_overlay','close_overlay')
      GROUP BY e.type, label
      ORDER BY count DESC
      LIMIT 40
    `,
    [vid]
  );

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(
    JSON.stringify({
      visitor,
      sessions,
      cluster: { id: groupId, display_name: groupName, session_cookies: scids, ips, fingerprints: fpids },
      refs: { tags: refTags, hosts: refHosts },
      stats: {
        sessions_human: Number(stats.sessions_human ?? 0),
        sessions_bot: Number(stats.sessions_bot ?? 0),
        avg_session_seconds: stats.avg_session_seconds ?? null,
        avg_actions: stats.avg_actions ?? null,
        total_actions: Number(stats.total_actions ?? 0),
      },
      top_actions: actionRes.rows,
      related,
    })
  );
}

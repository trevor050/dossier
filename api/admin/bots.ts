import { requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { query, getPool } from '../../server/db.js';
import { fetchAndCacheFreeIp } from '../../server/freeip.js';

function getFreeIpSummary(data: any): any | null {
  if (!data || typeof data !== 'object') return null;
  const conn = (data as any).connection ?? {};
  const tz = (data as any).timezone ?? {};
  return {
    city: (data as any).city ?? null,
    region: (data as any).region ?? null,
    country: (data as any).country ?? null,
    postal: (data as any).postal ?? (data as any).zip ?? null,
    timezone: tz.id ?? tz.name ?? null,
    org: conn.org ?? null,
    isp: conn.isp ?? null,
    asn: conn.asn ?? null,
  };
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
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days') ?? 30) || 30));

  const sessionsRes = await query<any>(
    `
      SELECT
        sid,
        vid,
        started_at,
        ip,
        ptr,
        bot_score,
        bot_reasons,
        user_agent,
        geo
      FROM sessions
      WHERE started_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND COALESCE(is_bot,false)=true
      ORDER BY started_at DESC
      LIMIT 250
    `,
    [days]
  );

  const reasonRes = await query<any>(
    `
      SELECT
        trim(r) AS reason,
        COUNT(*)::int AS count
      FROM (
        SELECT unnest(string_to_array(COALESCE(bot_reasons,''), ',')) AS r
        FROM sessions
        WHERE started_at >= NOW() - ($1::int * INTERVAL '1 day')
          AND COALESCE(is_bot,false)=true
      ) t
      WHERE trim(r) <> ''
      GROUP BY reason
      ORDER BY count DESC
      LIMIT 50
    `,
    [days]
  );

  const uaRes = await query<any>(
    `
      SELECT user_agent, COUNT(*)::int AS count
      FROM sessions
      WHERE started_at >= NOW() - ($1::int * INTERVAL '1 day')
        AND COALESCE(is_bot,false)=true
        AND user_agent IS NOT NULL AND user_agent <> ''
      GROUP BY user_agent
      ORDER BY count DESC
      LIMIT 20
    `,
    [days]
  );

  const sessions = sessionsRes.rows.map((s: any) => {
    const geo = s.geo ?? {};
    return {
      sid: s.sid,
      vid: s.vid,
      started_at: s.started_at,
      ip: s.ip ?? null,
      ptr: s.ptr ?? null,
      bot_score: s.bot_score ?? null,
      bot_reasons: s.bot_reasons ?? null,
      city: geo.city ?? null,
      region: geo.region ?? null,
      country: geo.country ?? null,
      user_agent: s.user_agent ?? null,
    };
  });

  // Enrich bot IPs with a free IP API (cached) to avoid burning IPinfo quota.
  const ips = Array.from(
    new Set(
      sessions
        .map((s: any) => s.ip)
        .filter((ip: any): ip is string => typeof ip === 'string' && ip.length > 0)
    )
  ).slice(0, 200);
  const cache = new Map<string, { data: any | null; error: string | null }>();
  if (ips.length) {
    const cacheRes = await query<any>(`SELECT ip, data, error FROM freeip_cache WHERE ip = ANY($1::text[])`, [ips]);
    for (const r of cacheRes.rows) cache.set(r.ip, { data: r.data ?? null, error: r.error ?? null });

    const missing = ips.filter((ip) => !cache.has(ip)).slice(0, 4);
    for (const ip of missing) {
      const fetched = await fetchAndCacheFreeIp(ip);
      cache.set(ip, { data: fetched.data, error: fetched.error });
    }
  }

  const enrichedSessions = sessions.map((s: any) => {
    const extra = s.ip ? cache.get(s.ip) : null;
    const freeip = extra?.data ? getFreeIpSummary(extra.data) : null;
    return { ...s, freeip, freeip_error: extra?.error ?? null };
  });

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ days, sessions: enrichedSessions, reasons: reasonRes.rows, user_agents: uaRes.rows }));
}

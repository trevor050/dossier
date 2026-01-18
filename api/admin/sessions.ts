import { requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { query, getPool } from '../../server/db.js';

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
  const bots = url.searchParams.get('bots') === '1';

  const { rows } = await query<any>(
    `
      SELECT
        sid,
        vid,
        (SELECT display_name FROM visitors v WHERE v.vid = sessions.vid) AS display_name,
        started_at,
        ended_at,
        ip,
        ptr,
        is_bot,
        bot_score,
        bot_reasons,
        is_mobile,
        orientation,
        active_seconds,
        idle_seconds,
        session_seconds,
        interactions,
        overlays_unique,
        session_cookie_id,
        fingerprint_id,
        ref_tag,
        geo,
        ipinfo,
        user_agent
      FROM sessions
      WHERE ($1::boolean IS TRUE) OR (COALESCE(is_bot, FALSE) = FALSE)
      ORDER BY started_at DESC
      LIMIT 250
    `,
    [bots]
  );

  const sessions = rows.map((s: any) => {
      const geo = s.geo ?? {};
      const ipinfo = s.ipinfo ?? {};

    return {
      sid: s.sid,
      vid: s.vid,
      vid_short: typeof s.vid === 'string' ? s.vid.slice(0, 8) : '',
      display_name: s.display_name ?? null,
      started_at: s.started_at,
      ended_at: s.ended_at,
      ip: s.ip,
      ptr: s.ptr ?? null,
      is_bot: s.is_bot,
        bot_score: s.bot_score,
        bot_reasons: s.bot_reasons,
        is_mobile: s.is_mobile,
        orientation: s.orientation,
        active_seconds: s.active_seconds,
        idle_seconds: s.idle_seconds,
      session_seconds: s.session_seconds,
      interactions: s.interactions,
      overlays_unique: s.overlays_unique,
      session_cookie_id: s.session_cookie_id ?? null,
      fingerprint_id: s.fingerprint_id ?? null,
      ref_tag: s.ref_tag ?? null,
        city: geo.city ?? null,
        region: geo.region ?? null,
        country: geo.country ?? null,
      asn: geo.asn ?? null,
      as_name: geo.asName ?? null,
      org: ipinfo.org ?? ipinfo.company?.name ?? null,
      user_agent: s.user_agent ?? null,
    };
  });

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ sessions }));
}

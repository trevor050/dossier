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
  const sid = url.searchParams.get('sid');
  const fromIdRaw = url.searchParams.get('from');
  const limitRaw = url.searchParams.get('limit');

  if (!sid || sid.length > 128) {
    res.statusCode = 400;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing sid' }));
    return;
  }

  const fromId = fromIdRaw && /^\d+$/.test(fromIdRaw) ? Number(fromIdRaw) : 0;
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Math.max(1, Math.min(200, Number(limitRaw))) : 60;

  const rowsRes = await query<any>(
    `
      SELECT id, ts, events
      FROM replay_events
      WHERE sid = $1 AND id > $2
      ORDER BY id ASC
      LIMIT ${limit}
    `,
    [sid, fromId],
  );

  const rows = rowsRes.rows || [];
  const events = rows.flatMap((r: any) => (Array.isArray(r.events) ? r.events : []));
  const lastId = rows.length ? rows[rows.length - 1].id : fromId;

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ sid, from: fromId, last_id: lastId, events }));
}


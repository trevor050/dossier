import { getPool } from '../../server/db.js';
import { getAuthToken, requireAdmin } from '../../server/admin.js';
import { ensureSchema } from '../../server/schema.js';
import { getSettings, updateSettings } from '../../server/settings.js';
import { readRawBody } from '../../server/http.js';

export default async function handler(_req: any, res: any) {
  const req: any = _req;

  const dbConfigured = Boolean(getPool());
  const expectedToken = process.env.ADMIN_TOKEN;
  const actualToken = getAuthToken(req);
  const isAuthed = Boolean(expectedToken && actualToken && actualToken === expectedToken);

  if (req.method === 'POST') {
    if (!requireAdmin(req, res)) return;
    if (!dbConfigured) {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'DATABASE_URL not configured' }));
      return;
    }

    await ensureSchema();
    const raw = await readRawBody(req, 25_000);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    const settings = await updateSettings(body ?? {});

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ settings }));
    return;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, POST');
    res.end('Method Not Allowed');
    return;
  }

  const base: any = {
    db_configured: dbConfigured,
    admin_token_configured: Boolean(process.env.ADMIN_TOKEN),
    ipinfo_token_configured: Boolean(process.env.IPINFO_TOKEN),
    bot_score_threshold: process.env.BOT_SCORE_THRESHOLD ?? '6',
  };

  if (isAuthed && dbConfigured) {
    await ensureSchema();
    base.settings = await getSettings().catch(() => null);
  }

  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(base));
}

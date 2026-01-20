import { ensureSchema } from '../server/schema.js';
import { query, getPool } from '../server/db.js';
import {
  allowedHosts,
  getClientIp,
  getHeader,
  readRawBody,
  safeHostFromUrl,
  sameSiteRequest,
} from '../server/http.js';

function clampString(value: any, max = 5000): string | null {
  if (typeof value !== 'string') return null;
  if (value.length > max) return value.slice(0, max);
  return value;
}

function allowRequest(req: any): boolean {
  if (sameSiteRequest(req)) return true;

  const originHost = safeHostFromUrl(getHeader(req, 'origin'));
  const refererHost = safeHostFromUrl(getHeader(req, 'referer'));
  const allow = allowedHosts(req);

  return (originHost ? allow.has(originHost) : false) || (refererHost ? allow.has(refererHost) : false);
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Allow', 'POST');
      res.end('Method Not Allowed');
      return;
    }

    if (!allowRequest(req)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    // If DB isn't configured yet, don't break the site.
    if (!getPool()) {
      res.statusCode = 204;
      res.end();
      return;
    }

    const raw = await readRawBody(req, 900_000);
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    if (body?.internal === true) {
      res.statusCode = 204;
      res.end();
      return;
    }

    const vid = clampString(body?.vid, 128);
    const sid = clampString(body?.sid, 128);
    if (!vid || !sid) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const eventsRaw = Array.isArray(body?.events) ? body.events : [];
    const events = eventsRaw.slice(0, 800);
    if (!events.length) {
      res.statusCode = 204;
      res.end();
      return;
    }

    await ensureSchema();

    const ip = getClientIp(req);
    if (ip) {
      await query(
        `
          INSERT INTO session_ips (sid, ip)
          VALUES ($1, $2)
          ON CONFLICT (sid, ip)
          DO UPDATE SET last_seen_at = NOW(), hit_count = session_ips.hit_count + 1
        `,
        [sid, ip],
      );
    }

    const chunkSeq = typeof body?.chunk_seq === 'number' ? body.chunk_seq : null;

    await query(
      `
        INSERT INTO replay_events (sid, vid, chunk_seq, events)
        VALUES ($1, $2, $3, $4::jsonb)
      `,
      [sid, vid, chunkSeq, JSON.stringify(events)],
    );

    // Touch session row to keep it "fresh".
    await query(`UPDATE sessions SET updated_at = NOW() WHERE sid = $1`, [sid]).catch(() => {});

    res.statusCode = 204;
    res.end();
  } catch {
    // Never throw noisy errors to the client; the site should keep working.
    res.statusCode = 204;
    res.end();
  }
}


import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison (hashes first so length differences don't leak either). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

export const SESSION_COOKIE = 'dossier_admin';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function sessionKey(adminToken: string): Buffer {
  // Derived from the token, so rotating ADMIN_TOKEN signs everyone out.
  return createHash('sha256').update(`dossier-admin-session\0${adminToken}`).digest();
}

/** A signed, expiring session value: `<expiresAtSeconds>.<hmac>`. Contains no secret material. */
export function signSession(adminToken: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + SESSION_TTL_SECONDS;
  const mac = createHmac('sha256', sessionKey(adminToken)).update(String(exp)).digest('base64url');
  return `${exp}.${mac}`;
}

export function verifySession(adminToken: string, value: string | null | undefined, nowMs = Date.now()): boolean {
  if (!value || value.length > 200) return false;
  const [expRaw, mac] = value.split('.');
  if (!expRaw || !mac || !/^\d{1,12}$/.test(expRaw)) return false;
  const exp = Number(expRaw);
  if (exp * 1000 <= nowMs) return false;
  const expected = createHmac('sha256', sessionKey(adminToken)).update(expRaw).digest('base64url');
  return safeEqual(mac, expected);
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

/**
 * Fixed-window in-memory rate limiter. On serverless hosts each instance has its
 * own memory, so this is a best-effort brake, not a hard global limit.
 */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 10_000,
  ) {}

  /** Returns true when the request is allowed. */
  take(key: string, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      if (this.hits.size >= this.maxKeys) this.prune(now);
      this.hits.set(key, { windowStart: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private prune(now: number) {
    for (const [k, v] of this.hits) {
      if (now - v.windowStart >= this.windowMs) this.hits.delete(k);
    }
    if (this.hits.size >= this.maxKeys) this.hits.clear();
  }
}

import { promises as dns } from 'node:dns';
import { query } from './db.js';

type PtrCacheRow = {
  ip: string;
  ptr: string | null;
  fetched_at: string | null;
  error: string | null;
  error_at: string | null;
};

function isPrivateIp(ip: string): boolean {
  // IPv6 loopback / local
  if (ip === '::1') return true;
  if (ip.startsWith('fc') || ip.startsWith('fd')) return true;
  if (ip.startsWith('fe80:')) return true;

  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function normalizePtr(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().replace(/\.$/, '');
  if (!trimmed) return null;
  if (trimmed.length > 255) return trimmed.slice(0, 255);
  return trimmed;
}

export async function getPtrCached(ip: string): Promise<{ ptr: string | null; error: string | null }> {
  try {
    const { rows } = await query<PtrCacheRow>(`SELECT ip, ptr, fetched_at, error, error_at FROM ptr_cache WHERE ip = $1`, [
      ip,
    ]);
    const row = rows[0];
    if (!row) return { ptr: null, error: null };
    return { ptr: normalizePtr(row.ptr), error: row.error ?? null };
  } catch {
    return { ptr: null, error: null };
  }
}

export async function fetchAndCachePtr(ip: string): Promise<{ ptr: string | null; error: string | null }> {
  if (isPrivateIp(ip)) return { ptr: null, error: 'private_ip' };

  let ptr: string | null = null;
  let error: string | null = null;

  try {
    const res = await dns.reverse(ip);
    ptr = normalizePtr(res?.[0]);
  } catch (err: any) {
    error = typeof err?.message === 'string' ? err.message.slice(0, 240) : 'ptr_lookup_failed';
  }

  try {
    await query(
      `
        INSERT INTO ptr_cache (ip, ptr, fetched_at, error, error_at)
        VALUES ($1, $2, NOW(), $3, CASE WHEN $3 IS NULL THEN NULL ELSE NOW() END)
        ON CONFLICT (ip) DO UPDATE SET
          ptr = COALESCE(EXCLUDED.ptr, ptr_cache.ptr),
          fetched_at = COALESCE(EXCLUDED.fetched_at, ptr_cache.fetched_at),
          error = EXCLUDED.error,
          error_at = EXCLUDED.error_at
      `,
      [ip, ptr, error]
    );
  } catch {
    // ignore cache write failures
  }

  return { ptr, error };
}


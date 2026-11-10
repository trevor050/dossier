import { promises as dns } from 'node:dns';
import type { Db } from './db.js';
import type { DossierConfig } from './config.js';

/** Normalized IP details, whatever the source. */
export type IpDetails = {
  city: string | null;
  region: string | null;
  country: string | null;
  org: string | null;
  lat: number | null;
  lon: number | null;
  source: 'ipinfo' | 'ipwhois';
};

const TIMEOUT_MS = 2500;
const CACHE_DAYS = 30;

/** RFC1918, loopback, link-local, CGNAT, unique-local IPv6 and friends. */
export function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === '::1' || v === '::' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true;
  const parts = v.split('.');
  if (parts.length !== 4) return false;
  const [a, b] = parts.map(Number) as [number, number];
  if ([a, b].some((n) => !Number.isInteger(n))) return false;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOrNull = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Accepts IPinfo standard (`ipinfo.io/{ip}`) and Lite (`api.ipinfo.io/lite/{ip}`) responses. */
export function normalizeIpinfo(data: unknown): IpDetails | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const [lat, lon] = typeof d.loc === 'string' ? d.loc.split(',').map(Number) : [NaN, NaN];
  const org =
    str(d.org) ??
    (str(d.as_name) ? [str(d.asn), str(d.as_name)].filter(Boolean).join(' ') : null) ??
    str((d.company as Record<string, unknown> | undefined)?.name);
  return {
    city: str(d.city),
    region: str(d.region),
    country: str(d.country_code) ?? str(d.country),
    org,
    lat: Number.isFinite(lat) ? (lat as number) : null,
    lon: Number.isFinite(lon) ? (lon as number) : null,
    source: 'ipinfo',
  };
}

export function normalizeIpwhois(data: unknown): IpDetails | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.success === false) return null;
  const conn = (d.connection ?? {}) as Record<string, unknown>;
  return {
    city: str(d.city),
    region: str(d.region),
    country: str(d.country_code) ?? str(d.country),
    org: str(conn.org) ?? str(conn.isp),
    lat: numOrNull(d.latitude),
    lon: numOrNull(d.longitude),
    source: 'ipwhois',
  };
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`http_${res.status}`);
  return (await res.json()) as unknown;
}

type CacheTable = 'ipinfo_cache' | 'freeip_cache';

async function cached(
  db: Db,
  table: CacheTable,
  ip: string,
  load: () => Promise<unknown>,
): Promise<unknown | null> {
  const { rows } = await db.query<{ data: unknown; error: string | null; fresh: boolean }>(
    `SELECT data, error, (COALESCE(fetched_at, error_at) > NOW() - ($2::int * INTERVAL '1 day')) AS fresh
       FROM ${table} WHERE ip = $1`,
    [ip, CACHE_DAYS],
  );
  const row = rows[0];
  if (row?.fresh) return row.data ?? null;
  try {
    const data = await load();
    await db.query(
      `INSERT INTO ${table} (ip, data, fetched_at, error, error_at) VALUES ($1, $2::jsonb, NOW(), NULL, NULL)
       ON CONFLICT (ip) DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW(), error = NULL, error_at = NULL`,
      [ip, JSON.stringify(data)],
    );
    return data;
  } catch (err) {
    const message = (err instanceof Error ? err.message : 'error').slice(0, 120);
    await db.query(
      `INSERT INTO ${table} (ip, error, error_at) VALUES ($1, $2, NOW())
       ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, error_at = NOW()`,
      [ip, message],
    );
    return row?.data ?? null;
  }
}

/**
 * Look an IP up with whichever providers the operator enabled. Returns null when
 * enrichment is off, the IP is private, or every provider failed.
 */
export async function lookupIp(db: Db, ip: string, config: DossierConfig): Promise<IpDetails | null> {
  if (isPrivateIp(ip)) return null;
  if (config.ipinfoToken) {
    const token = config.ipinfoToken;
    const url =
      config.ipinfoApi === 'standard'
        ? `https://ipinfo.io/${encodeURIComponent(ip)}`
        : `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}`;
    // Token goes in a header, never in the URL (URLs end up in logs).
    const data = await cached(db, 'ipinfo_cache', ip, () => fetchJson(url, { authorization: `Bearer ${token}` }));
    const details = normalizeIpinfo(data);
    if (details) return details;
  }
  if (config.ipwhois) {
    const data = await cached(db, 'freeip_cache', ip, () => fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`, {}));
    return normalizeIpwhois(data);
  }
  return null;
}

/** Reverse DNS (PTR) via the system resolver, cached. Often reveals the network ("*.comcast.net", "*.amazonaws.com"). */
export async function lookupPtr(db: Db, ip: string, config: DossierConfig): Promise<string | null> {
  if (!config.ptr || isPrivateIp(ip)) return null;
  const { rows } = await db.query<{ ptr: string | null; fresh: boolean }>(
    `SELECT ptr, (COALESCE(fetched_at, error_at) > NOW() - ($2::int * INTERVAL '1 day')) AS fresh FROM ptr_cache WHERE ip = $1`,
    [ip, CACHE_DAYS],
  );
  if (rows[0]?.fresh) return rows[0].ptr ?? null;
  let ptr: string | null = null;
  let error: string | null = null;
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
    ]);
    ptr = names[0]?.replace(/\.$/, '').slice(0, 255) || null;
  } catch (err) {
    error = (err instanceof Error ? err.message : 'ptr_failed').slice(0, 120);
  }
  await db.query(
    `INSERT INTO ptr_cache (ip, ptr, fetched_at, error, error_at)
     VALUES ($1, $2, NOW(), $3, CASE WHEN $3::text IS NULL THEN NULL ELSE NOW() END)
     ON CONFLICT (ip) DO UPDATE SET ptr = EXCLUDED.ptr, fetched_at = NOW(), error = EXCLUDED.error, error_at = EXCLUDED.error_at`,
    [ip, ptr, error],
  );
  return ptr;
}

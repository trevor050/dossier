import { query } from './db.js';

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    if (!Number.isNaN(second) && second >= 16 && second <= 31) return true;
  }
  // IPv6 loopback / link-local
  if (ip === '::1' || ip.startsWith('fe80:')) return true;
  return false;
}

export async function getIpinfoCached(ip: string): Promise<{ data: any | null; error: string | null }> {
  const { rows } = await query<{ data: any; error: string | null }>(
    `SELECT data, error FROM ipinfo_cache WHERE ip = $1`,
    [ip]
  );
  const row = rows[0];
  if (!row) return { data: null, error: null };
  return { data: row.data ?? null, error: row.error ?? null };
}

export async function fetchAndCacheIpinfo(ip: string): Promise<{ data: any | null; error: string | null }> {
  if (isPrivateIp(ip)) return { data: null, error: 'private_ip' };

  const token = process.env.IPINFO_TOKEN;
  if (!token) return { data: null, error: 'missing_ipinfo_token' };

  const url = `https://ipinfo.io/${encodeURIComponent(ip)}?token=${encodeURIComponent(token)}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      const message = `ipinfo_http_${res.status}`;
      await query(
        `INSERT INTO ipinfo_cache (ip, error, error_at) VALUES ($1, $2, NOW())
         ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, error_at = NOW()`,
        [ip, message]
      );
      return { data: null, error: message };
    }

    const data = await res.json();
    await query(
      `INSERT INTO ipinfo_cache (ip, data, fetched_at, error, error_at)
       VALUES ($1, $2::jsonb, NOW(), NULL, NULL)
       ON CONFLICT (ip) DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW(), error = NULL, error_at = NULL`,
      [ip, JSON.stringify(data)]
    );
    return { data, error: null };
  } catch (err: any) {
    const message = err?.message ? `ipinfo_error_${String(err.message).slice(0, 80)}` : 'ipinfo_error';
    await query(
      `INSERT INTO ipinfo_cache (ip, error, error_at) VALUES ($1, $2, NOW())
       ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, error_at = NOW()`,
      [ip, message]
    );
    return { data: null, error: message };
  }
}

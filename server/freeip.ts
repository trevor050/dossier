import { query } from './db.js';

function isPrivateIp(ip: string): boolean {
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('127.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    if (!Number.isNaN(second) && second >= 16 && second <= 31) return true;
  }
  if (ip === '::1' || ip.startsWith('fe80:')) return true;
  return false;
}

export async function getFreeIpCached(ip: string): Promise<{ data: any | null; error: string | null; fetched_at: string | null }> {
  const { rows } = await query<{ data: any; error: string | null; fetched_at: string | null }>(
    `SELECT data, error, fetched_at FROM freeip_cache WHERE ip = $1`,
    [ip],
  );
  const row = rows[0];
  if (!row) return { data: null, error: null, fetched_at: null };
  return { data: row.data ?? null, error: row.error ?? null, fetched_at: row.fetched_at ?? null };
}

export async function fetchAndCacheFreeIp(ip: string): Promise<{ data: any | null; error: string | null }> {
  if (isPrivateIp(ip)) return { data: null, error: 'private_ip' };

  const url = `https://ipwho.is/${encodeURIComponent(ip)}`;
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) {
      const message = `freeip_http_${res.status}`;
      await query(
        `INSERT INTO freeip_cache (ip, error, error_at) VALUES ($1, $2, NOW())
         ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, error_at = NOW()`,
        [ip, message],
      );
      return { data: null, error: message };
    }

    const data = await res.json();
    if (data && typeof data === 'object' && data.success === false) {
      const message = data?.message ? `freeip_${String(data.message).slice(0, 80)}` : 'freeip_error';
      await query(
        `INSERT INTO freeip_cache (ip, error, error_at) VALUES ($1, $2, NOW())
         ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, error_at = NOW()`,
        [ip, message],
      );
      return { data: null, error: message };
    }

    await query(
      `INSERT INTO freeip_cache (ip, data, fetched_at, error, error_at)
       VALUES ($1, $2::jsonb, NOW(), NULL, NULL)
       ON CONFLICT (ip) DO UPDATE SET data = EXCLUDED.data, fetched_at = NOW(), error = NULL, error_at = NULL`,
      [ip, JSON.stringify(data)],
    );
    return { data, error: null };
  } catch (err: any) {
    const message = err?.message ? `freeip_error_${String(err.message).slice(0, 80)}` : 'freeip_error';
    await query(
      `INSERT INTO freeip_cache (ip, error, error_at) VALUES ($1, $2, NOW())
       ON CONFLICT (ip) DO UPDATE SET error = EXCLUDED.error, error_at = NOW()`,
      [ip, message],
    );
    return { data: null, error: message };
  }
}


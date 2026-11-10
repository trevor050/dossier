/** Runtime configuration, read from environment variables on each call (cheap, and test friendly). */
export type DossierConfig = {
  adminToken: string | null;
  ipinfoToken: string | null;
  ipinfoApi: 'lite' | 'standard';
  ipwhois: boolean;
  ptr: boolean;
  botThreshold: number;
  linkThreshold: number;
  allowedHosts: string[];
  allowLocalhost: boolean;
  replayMaxBytesPerSession: number;
  maxEventsPerSession: number;
};

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value == null || value === '') return fallback;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

function num(value: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function getConfig(env: NodeJS.ProcessEnv = process.env): DossierConfig {
  const hosts = [env.DOSSIER_ALLOWED_HOSTS, env.REPORT_ALLOWED_HOSTS]
    .filter(Boolean)
    .flatMap((v) => String(v).split(','))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const production = env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production';
  return {
    adminToken: (env.DOSSIER_ADMIN_TOKEN || env.ADMIN_TOKEN || '').trim() || null,
    ipinfoToken: (env.IPINFO_TOKEN || '').trim() || null,
    ipinfoApi: env.IPINFO_API === 'standard' ? 'standard' : 'lite',
    ipwhois: bool(env.DOSSIER_IPWHOIS, false),
    ptr: bool(env.DOSSIER_PTR, true),
    botThreshold: num(env.BOT_SCORE_THRESHOLD, 6, 1, 100),
    linkThreshold: num(env.DOSSIER_LINK_THRESHOLD, 0.5, 0.05, 1),
    allowedHosts: hosts,
    allowLocalhost: bool(env.DOSSIER_ALLOW_LOCALHOST, !production),
    replayMaxBytesPerSession: Math.floor(num(env.DOSSIER_REPLAY_MAX_MB, 5, 0.1, 100) * 1024 * 1024),
    maxEventsPerSession: num(env.DOSSIER_MAX_EVENTS_PER_SESSION, 5000, 100, 100_000),
  };
}

/** Admin tokens shorter than this are refused outright. */
export const MIN_ADMIN_TOKEN_LENGTH = 16;

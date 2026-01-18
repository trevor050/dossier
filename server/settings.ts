import { query } from './db.js';

export type TrackerSettings = {
  retention_human_days: number;
  retention_bot_days: number;
  map_include_bots_default: boolean;
};

const DEFAULTS: TrackerSettings = {
  retention_human_days: 365,
  retention_bot_days: 30,
  map_include_bots_default: false,
};

function toInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return fallback;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === '1' || value.toLowerCase() === 'true') return true;
    if (value === '0' || value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

export async function getSettings(): Promise<TrackerSettings> {
  const { rows } = await query<any>(`SELECT retention_human_days, retention_bot_days, map_include_bots_default FROM tracker_settings WHERE id = 1`);
  const row = rows[0] ?? {};
  return {
    retention_human_days: Math.max(1, Math.min(3650, toInt(row.retention_human_days, DEFAULTS.retention_human_days))),
    retention_bot_days: Math.max(1, Math.min(365, toInt(row.retention_bot_days, DEFAULTS.retention_bot_days))),
    map_include_bots_default: toBool(row.map_include_bots_default, DEFAULTS.map_include_bots_default),
  };
}

export async function updateSettings(patch: Partial<TrackerSettings>): Promise<TrackerSettings> {
  const current = await getSettings().catch(() => DEFAULTS);
  const next: TrackerSettings = {
    retention_human_days:
      patch.retention_human_days == null
        ? current.retention_human_days
        : Math.max(1, Math.min(3650, toInt(patch.retention_human_days, current.retention_human_days))),
    retention_bot_days:
      patch.retention_bot_days == null
        ? current.retention_bot_days
        : Math.max(1, Math.min(365, toInt(patch.retention_bot_days, current.retention_bot_days))),
    map_include_bots_default:
      patch.map_include_bots_default == null ? current.map_include_bots_default : toBool(patch.map_include_bots_default, current.map_include_bots_default),
  };

  await query(
    `
      INSERT INTO tracker_settings (id, retention_human_days, retention_bot_days, map_include_bots_default)
      VALUES (1, $1, $2, $3)
      ON CONFLICT (id) DO UPDATE SET
        retention_human_days = EXCLUDED.retention_human_days,
        retention_bot_days = EXCLUDED.retention_bot_days,
        map_include_bots_default = EXCLUDED.map_include_bots_default
    `,
    [next.retention_human_days, next.retention_bot_days, next.map_include_bots_default],
  );

  return next;
}


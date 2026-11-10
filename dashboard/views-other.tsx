import { useState } from 'preact/hooks';
import { WORLD_PATH } from '../src/generated/world.js';
import { ago, bytes, dateTime, duration, href, plural, post, useApi } from './lib.js';

type MapData = {
  points: Array<{ id: string; name: string; named: boolean; visits: number; last_seen: string; is_bot: boolean; lat: number; lon: number; place: string }>;
  unplaced: number;
};

// Same projection the build step used for WORLD_PATH (equirectangular, 1000x500).
const project = (lat: number, lon: number) => ({ x: ((lon + 180) / 360) * 1000, y: ((90 - lat) / 180) * 500 });

export function MapView({ bots }: { bots: boolean }) {
  const { data, error } = useApi<MapData>('map', { bots, days: 365 });
  const [hover, setHover] = useState<string | null>(null);
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return <p class="muted">Loading…</p>;

  // Group people at (almost) the same coordinates.
  const groups = new Map<string, MapData['points']>();
  for (const p of data.points) {
    const key = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const places = [...groups.values()].sort((a, b) => b.length - a.length);

  return (
    <>
      <section class="block">
        <div class="block-head">
          <h2>Where people opened it</h2>
          <span class="muted">
            {plural(data.points.length, 'person', 'people')} placed
            {data.unplaced > 0 && ` · ${data.unplaced} without a location`}
          </span>
        </div>
        <svg class="world" viewBox="0 15 1000 400" role="img" aria-label="World map of visitors">
          <path d={WORLD_PATH} class="land" />
          {places.map((group) => {
            const p = group[0]!;
            const { x, y } = project(p.lat, p.lon);
            const named = group.some((g) => g.named);
            const r = 3 + Math.min(6, Math.sqrt(group.reduce((n, g) => n + g.visits, 0)) * 1.4);
            return (
              <g
                class={`pin ${named ? 'named' : ''} ${group.every((g) => g.is_bot) ? 'bot' : ''}`}
                onMouseEnter={() => setHover(p.place)}
                onMouseLeave={() => setHover(null)}
              >
                <circle cx={x} cy={y} r={r} />
                {named && (
                  <text x={x + r + 3} y={y + 3.5}>
                    {group.find((g) => g.named)!.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <p class="muted small">{hover ?? 'Locations come from Vercel geo headers or IP enrichment, accurate to roughly city level at best.'}</p>
      </section>
      <section class="block">
        <h2>Places</h2>
        <table>
          <tbody>
            {places.map((group) => (
              <tr>
                <td>{group[0]!.place || 'Unknown'}</td>
                <td>
                  {group.map((g, i) => (
                    <>
                      {i > 0 && ', '}
                      <a href={href('p', g.id)}>{g.name}</a>
                    </>
                  ))}
                </td>
                <td class="num">{ago(group.map((g) => g.last_seen).sort().pop())}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

type ContentData = {
  days: number;
  sessions: number;
  sections: Array<{ key: string; seconds: number; visitors: number }>;
  pages: Array<{ path: string; visitors: number }>;
  referrers: Array<{ host: string; visits: number }>;
};

export function ContentView({ days }: { days: number }) {
  const { data, error } = useApi<ContentData>('content', { days });
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return <p class="muted">Loading…</p>;
  return (
    <div class="columns">
      <section class="block">
        <div class="block-head">
          <h2>Sections</h2>
          <span class="muted">active time across {plural(data.sessions, 'human visit')}</span>
        </div>
        {data.sections.length ? (
          <table>
            <thead>
              <tr>
                <th>Section</th>
                <th class="num">Time</th>
                <th class="num">People</th>
                <th class="num">Avg</th>
              </tr>
            </thead>
            <tbody>
              {data.sections.map((s) => (
                <tr>
                  <td>{s.key}</td>
                  <td class="num">{duration(s.seconds)}</td>
                  <td class="num">{s.visitors}</td>
                  <td class="num">{duration(s.seconds / Math.max(1, s.visitors))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="empty">No section data yet.</p>
        )}
      </section>
      <section class="block">
        <h2>Pages</h2>
        <table>
          <tbody>
            {data.pages.map((p) => (
              <tr>
                <td class="mono">{p.path}</td>
                <td class="num">{plural(p.visitors, 'visitor')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Came from</h2>
        <table>
          <tbody>
            {data.referrers.map((r) => (
              <tr>
                <td>{r.host}</td>
                <td class="num">{plural(r.visits, 'visit')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

type BotsData = {
  days: number;
  sessions: Array<{ sid: string; vid: string; started_at: string; ip: string | null; ptr: string | null; user_agent: string | null; score: number; reasons: string | null; country: string | null; org: string | null }>;
  reasons: Array<{ reason: string; count: number }>;
};

export function BotsView({ days }: { days: number }) {
  const { data, error, reload } = useApi<BotsData>('bots', { days });
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return <p class="muted">Loading…</p>;
  const notBot = async (vid: string) => {
    await post('mark', { vids: [vid], is_bot: false });
    reload();
  };
  return (
    <>
      <section class="block">
        <div class="block-head">
          <h2>Filtered as bots</h2>
          <span class="muted">
            {plural(data.sessions.length, 'visit')} in the last {days} days. They are kept out of People, the map and identity linking.
          </span>
        </div>
        <p class="reasons">
          {data.reasons.map((r) => (
            <span>
              {r.reason} <b>{r.count}</b>
            </span>
          ))}
        </p>
      </section>
      <section class="block">
        <table class="bots">
          <thead>
            <tr>
              <th>When</th>
              <th>Why</th>
              <th>Network</th>
              <th>User agent</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.sessions.map((s) => (
              <tr>
                <td class="nowrap">
                  <a href={href('s', s.sid)}>{dateTime(s.started_at)}</a>
                </td>
                <td>
                  {s.reasons} <span class="muted">({s.score})</span>
                </td>
                <td>{[s.country, s.org, s.ptr].filter(Boolean).join(' · ') || s.ip}</td>
                <td class="ua">{s.user_agent}</td>
                <td>
                  <button class="small" onClick={() => notBot(s.vid)}>
                    Not a bot
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

type SettingsData = {
  settings: { retention_human_days: number; retention_bot_days: number; retention_replay_days: number };
  storage: { visitors: number; sessions: number; events: number; replay_bytes: number };
  enrichment: { ipinfo: string | null; ipwhois: boolean; ptr: boolean };
  bot_threshold: number;
  link_threshold: number;
};

export function SettingsView({ demo }: { demo: boolean }) {
  const { data, error, reload } = useApi<SettingsData>('settings');
  const [message, setMessage] = useState<string | null>(null);
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return <p class="muted">Loading…</p>;
  const save = async (e: Event) => {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    try {
      await post('settings', Object.fromEntries(form.entries()));
      setMessage('Saved.');
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save');
    }
  };
  const prune = async () => {
    try {
      const r = await post<Record<string, number>>('prune', {});
      setMessage(`Cleanup removed ${r.sessions} sessions, ${r.replay_chunks} replay chunks, ${r.visitors} visitors.`);
      reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Cleanup failed');
    }
  };
  const origin = location.origin;
  return (
    <div class="columns">
      <section class="block">
        <h2>Retention</h2>
        <form class="settings" onSubmit={save}>
          <label>
            Keep human visits for
            <input name="retention_human_days" type="number" min={1} max={3650} defaultValue={String(data.settings.retention_human_days)} /> days
          </label>
          <label>
            Keep bot visits for
            <input name="retention_bot_days" type="number" min={1} max={365} defaultValue={String(data.settings.retention_bot_days)} /> days
          </label>
          <label>
            Keep session replays for
            <input name="retention_replay_days" type="number" min={1} max={365} defaultValue={String(data.settings.retention_replay_days)} /> days
          </label>
          <div class="actions">
            <button class="primary small" disabled={demo}>
              Save
            </button>
            <button class="small" type="button" onClick={prune} disabled={demo}>
              Run cleanup now
            </button>
          </div>
          {message && <p class="muted">{message}</p>}
          <p class="muted small">
            Expired data is also removed automatically during normal traffic, and by <code>npx dossier prune</code> if you run it on a schedule.
          </p>
        </form>
        <h2>Stored</h2>
        <p>
          {plural(data.storage.visitors, 'visitor')} · {plural(data.storage.sessions, 'visit')} · {plural(data.storage.events, 'event')} ·{' '}
          {bytes(data.storage.replay_bytes)} of replays
        </p>
      </section>
      <section class="block">
        <h2>IP enrichment</h2>
        <ul class="plain">
          <li>IPinfo: {data.enrichment.ipinfo ? `on (${data.enrichment.ipinfo} API)` : 'off (set IPINFO_TOKEN)'}</li>
          <li>ipwho.is: {data.enrichment.ipwhois ? 'on' : 'off (set DOSSIER_IPWHOIS=1)'}</li>
          <li>Reverse DNS: {data.enrichment.ptr ? 'on' : 'off'}</li>
        </ul>
        <p class="muted small">
          Enrichment sends visitor IP addresses to the provider. Everything works without it; you just get less location detail off Vercel.
        </p>
        <h2>Install snippet</h2>
        <pre>{`<script defer src="${origin}/api/collect"></script>`}</pre>
        <p class="muted small">
          Add <code>data-replay="0.25"</code> to record a quarter of sessions. Visitors can opt out with <code>?dossier=off</code>.
        </p>
      </section>
    </div>
  );
}

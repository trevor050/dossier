import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { LinkSummary, PersonSummary } from '../src/server/admin/people.js';
import './styles.css';
import { ApiError, api, href, plural, post, useApi, useRoute } from './lib.js';
import { BotsView, ContentView, MapView, SettingsView } from './views-other.js';
import { LinkView, NewLinkForm, PersonView, SessionView } from './views-person.js';
import { PersonRow, LinkRow } from './rows.js';

type Status = {
  demo: boolean;
  authed: boolean;
  db_configured: boolean;
  token_configured: boolean;
  token_too_short: boolean;
};

export type Overview = {
  days: number;
  links: LinkSummary[];
  people: PersonSummary[];
  hidden_bot_sessions: number;
};

const RANGES: Array<[number, string]> = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
  [3650, 'All time'],
];

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`dossier:${key}`);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(`dossier:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const check = () =>
    api<Status>('status').then(setStatus, (e: Error) => setError(e.message));
  useEffect(() => void check(), []);

  if (error) return <Setup title="Can't reach the Dossier API" detail={error} />;
  if (!status) return null;
  if (!status.authed && !status.token_configured) {
    return <Setup title="Set an admin token" detail="Add DOSSIER_ADMIN_TOKEN (at least 16 characters) to your environment, redeploy, then reload this page." />;
  }
  if (!status.authed && status.token_too_short) {
    return <Setup title="Admin token is too short" detail="DOSSIER_ADMIN_TOKEN must be at least 16 characters. Generate one with: openssl rand -base64 24" />;
  }
  if (!status.authed) return <Login onDone={check} />;
  if (!status.db_configured) {
    return <Setup title="No database configured" detail="Set DATABASE_URL to a Postgres connection string, run `npx dossier migrate`, and redeploy." />;
  }
  return <Shell demo={status.demo} />;
}

function Setup({ title, detail }: { title: string; detail: string }) {
  return (
    <main class="center">
      <div class="gate">
        <Wordmark />
        <h1>{title}</h1>
        <p class="muted">{detail}</p>
      </div>
    </main>
  );
}

function Wordmark() {
  return (
    <span class="wordmark">
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="5" y="3" width="22" height="26" rx="3" />
        <path d="M10 11h12M10 16.5h12M10 22h7" />
      </svg>
      Dossier
    </span>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('login', { token });
      onDone();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'error';
      setError(code === 'too_many_attempts' ? 'Too many attempts. Wait a few minutes.' : 'That token did not match.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main class="center">
      <form class="gate" onSubmit={submit}>
        <Wordmark />
        <label for="token">Admin token</label>
        <input
          id="token"
          type="password"
          autocomplete="current-password"
          value={token}
          onInput={(e) => setToken((e.target as HTMLInputElement).value)}
          autofocus
        />
        {error && <p class="error">{error}</p>}
        <button class="primary" disabled={busy || !token}>
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <p class="muted small">Signing in sets an HttpOnly session cookie for 7 days. The token itself is not stored in the browser.</p>
      </form>
    </main>
  );
}

const NAV: Array<[string, string]> = [
  ['', 'People'],
  ['map', 'Map'],
  ['content', 'Content'],
  ['bots', 'Bots'],
  ['settings', 'Settings'],
];

function Shell({ demo }: { demo: boolean }) {
  const route = useRoute();
  const [days, setDays] = useState<number>(() => readPref('days', 30));
  const [bots, setBots] = useState<boolean>(() => readPref('bots', false));
  useEffect(() => writePref('days', days), [days]);
  useEffect(() => writePref('bots', bots), [bots]);

  const [section = '', id] = route;
  const top = ['p', 'l', 's'].includes(section) ? '' : section;
  const logout = async () => {
    await post('logout', {}).catch(() => {});
    location.reload();
  };

  let view;
  if (section === 'p' && id) view = <PersonView id={id} />;
  else if (section === 'l' && id) view = <LinkView id={id} />;
  else if (section === 's' && id) view = <SessionView sid={id} />;
  else if (section === 'map') view = <MapView bots={bots} />;
  else if (section === 'content') view = <ContentView days={days} />;
  else if (section === 'bots') view = <BotsView days={Math.max(days, 7)} />;
  else if (section === 'settings') view = <SettingsView demo={demo} />;
  else view = <Home days={days} bots={bots} />;

  return (
    <>
      {demo && (
        <div class="demo-banner">
          Demo mode. Everyone here is made up; open <a href="/" target="_blank" rel="noreferrer">the sample site</a> to add yourself.
        </div>
      )}
      <header class="topbar">
        <a class="home" href="#/">
          <Wordmark />
        </a>
        <nav>
          {NAV.map(([key, label]) => (
            <a href={href(...(key ? [key] : []))} class={top === key ? 'on' : ''}>
              {label}
            </a>
          ))}
        </nav>
        <div class="filters">
          <select value={days} onChange={(e) => setDays(Number((e.target as HTMLSelectElement).value))} aria-label="Time range">
            {RANGES.map(([d, label]) => (
              <option value={d}>{label}</option>
            ))}
          </select>
          <label class="check">
            <input type="checkbox" checked={bots} onChange={(e) => setBots((e.target as HTMLInputElement).checked)} /> Bots
          </label>
          {!demo && (
            <button class="link" onClick={logout}>
              Sign out
            </button>
          )}
        </div>
      </header>
      <main class="page">{view}</main>
    </>
  );
}

function Home({ days, bots }: { days: number; bots: boolean }) {
  const { data, error, loading, reload } = useApi<Overview>('overview', { days, bots });
  const [creating, setCreating] = useState(false);
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return loading ? <p class="muted">Loading…</p> : null;

  // Most recently active first; links nobody has opened yet go last.
  const links = data.links
    .filter((l) => !l.archived)
    .sort((a, b) => (b.last_seen ?? '').localeCompare(a.last_seen ?? '') || b.created_at.localeCompare(a.created_at));
  const opened = links.filter((l) => l.opened).length;

  return (
    <>
      <section class="block">
        <div class="block-head">
          <h2>Links you sent</h2>
          <span class="muted">
            {links.length ? `${opened} of ${links.length} opened` : 'One link per person, so you know exactly who looked'}
          </span>
          <button class="primary small" onClick={() => setCreating((c) => !c)}>
            {creating ? 'Close' : 'New link'}
          </button>
        </div>
        {creating && (
          <NewLinkForm
            onCreated={() => {
              setCreating(false);
              reload();
            }}
          />
        )}
        {links.length ? (
          <ul class="rows">
            {links.map((l) => (
              <LinkRow link={l} />
            ))}
          </ul>
        ) : (
          !creating && (
            <p class="empty">
              No links yet. Create one per recipient (for example <code>colgate-admissions</code>), send them their own URL, and this list
              tells you whether they opened it, for how long, and what they looked at.
            </p>
          )
        )}
      </section>

      <section class="block">
        <div class="block-head">
          <h2>Everyone else</h2>
          <span class="muted">
            {plural(data.people.length, 'person', 'people')} without a link in the last {days >= 3650 ? 'forever' : `${days} days`}
            {data.hidden_bot_sessions > 0 && ` · ${plural(data.hidden_bot_sessions, 'bot visit')} hidden`}
          </span>
        </div>
        {data.people.length ? (
          <ul class="rows">
            {data.people.map((p) => (
              <PersonRow person={p} />
            ))}
          </ul>
        ) : (
          <p class="empty">Nobody yet. Visits show up here a few seconds after someone opens your site.</p>
        )}
      </section>
    </>
  );
}


render(<App />, document.getElementById('app')!);

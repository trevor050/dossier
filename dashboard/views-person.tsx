import { useEffect, useRef, useState } from 'preact/hooks';
import type { Dwell } from '../src/protocol.js';
import type { LinkSummary, PersonSummary, SessionView as Session } from '../src/server/admin/people.js';
import {
  ago,
  bytes,
  clock,
  copy,
  date,
  dateTime,
  device,
  duration,
  href,
  place,
  plural,
  post,
  useApi,
} from './lib.js';
import { Dots, PersonRow } from './rows.js';

type PersonData = {
  person: PersonSummary;
  links: Array<{ id: string; label: string; slug: string }>;
  visitors: Array<{ vid: string; display_name: string | null; label: string | null; first_seen: string; last_seen: string }>;
  sessions: Session[];
  attention: Dwell[];
  pages: Array<{ path: string; visits: number }>;
  clicks: Array<{ label: string; count: number }>;
  ips: Array<{ ip: string; last_seen: string; ptr: string | null; org: string | null }>;
  evidence: Array<{ from: string; vid: string; confidence: number; sharedCookie: boolean; sharedFingerprint: boolean; sharedNetwork: boolean }>;
};

function Bars({ items, unit = 'time' }: { items: Array<{ key: string; value: number }>; unit?: 'time' | 'count' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul class="bars">
      {items.map((i) => (
        <li>
          <span class="label" title={i.key}>
            {i.key}
          </span>
          <span class="bar">
            <i style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
          </span>
          <span class="val">{unit === 'time' ? duration(i.value) : i.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function linkUrl(slug: string, path = '/'): string {
  const u = new URL(path, location.origin);
  u.searchParams.set('to', slug);
  return u.toString();
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      class="small"
      onClick={async (e) => {
        e.preventDefault();
        if (await copy(text)) {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

export function NewLinkForm({ onCreated }: { onCreated: () => void }) {
  const [label, setLabel] = useState('');
  const [path, setPath] = useState('/');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ slug: string; id: string; path: string } | null>(null);
  const submit = async (e: Event) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await post<{ link: { slug: string; id: string; path: string } }>('links', { label, path });
      setCreated(res.link);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create link');
    }
  };
  if (created) {
    return (
      <div class="newlink">
        <p>
          Send this to <b>{label}</b>. The tag is removed from their address bar as soon as the page loads.
        </p>
        <div class="url">
          <code>{linkUrl(created.slug, created.path)}</code>
          <CopyButton text={linkUrl(created.slug, created.path)} />
        </div>
        <div class="url">
          <code>{linkUrl(created.id, created.path)}</code>
          <CopyButton text={linkUrl(created.id, created.path)} />
          <span class="muted small">same link, with a code that does not reveal the name</span>
        </div>
        <button class="primary small" onClick={onCreated}>
          Done
        </button>
      </div>
    );
  }
  return (
    <form class="newlink" onSubmit={submit}>
      <label>
        Who is it for?
        <input
          value={label}
          placeholder="Colgate admissions"
          maxLength={80}
          onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          autofocus
        />
      </label>
      <label>
        Page
        <input value={path} maxLength={300} onInput={(e) => setPath((e.target as HTMLInputElement).value)} />
      </label>
      <button class="primary" disabled={!label.trim()}>
        Create link
      </button>
      {error && <p class="error">{error}</p>}
    </form>
  );
}

export function LinkView({ id }: { id: string }) {
  const { data, reload } = useApi<{ links: LinkSummary[]; people: PersonSummary[] }>('overview', { days: 3650 });
  const link = data?.links.find((l) => l.id === id);
  if (!data) return <p class="muted">Loading…</p>;
  if (!link) return <p class="error">This link no longer exists.</p>;
  const people = link.person_ids;
  const update = async (patch: Record<string, unknown>) => {
    await post('link', { id, ...patch });
    if (patch.delete) location.hash = '#/';
    else reload();
  };
  return (
    <>
      <a class="back" href="#/">
        ← People
      </a>
      <header class="dossier-head">
        <h1>{link.label}</h1>
        <p class="facts">
          {link.opened ? (
            <>
              Opened {dateTime(link.first_opened_at)} · {plural(link.visits, 'visit')} on {plural(link.visit_days.length, 'day')} ·{' '}
              {duration(link.active_seconds)} active · last seen {ago(link.last_seen)}
            </>
          ) : (
            <>Not opened yet. Created {date(link.created_at)}.</>
          )}
        </p>
        <div class="url">
          <code>{linkUrl(link.slug, link.path)}</code>
          <CopyButton text={linkUrl(link.slug, link.path)} />
        </div>
        <div class="url">
          <code>{linkUrl(link.id, link.path)}</code>
          <CopyButton text={linkUrl(link.id, link.path)} label="Copy private" />
        </div>
        <div class="actions">
          <button class="small" onClick={() => update({ archived: !link.archived })}>
            {link.archived ? 'Unarchive' : 'Archive'}
          </button>
          <button
            class="small danger"
            onClick={() => confirm(`Delete the link "${link.label}"? Visits stay, they just lose the name.`) && update({ delete: true })}
          >
            Delete link
          </button>
        </div>
      </header>
      {people.length === 1 ? (
        <PersonView id={people[0]!} embedded />
      ) : people.length > 1 ? (
        <section class="block">
          <div class="block-head">
            <h2>{plural(people.length, 'person', 'people')} opened this link</h2>
            <span class="muted">Usually the recipient on two devices, or someone they forwarded it to</span>
          </div>
          <PeopleOfLink ids={people} />
        </section>
      ) : null}
    </>
  );
}

function PeopleOfLink({ ids }: { ids: string[] }) {
  return (
    <ul class="rows">
      {ids.map((pid) => (
        <PersonLoader id={pid} />
      ))}
    </ul>
  );
}

function PersonLoader({ id }: { id: string }) {
  const { data } = useApi<PersonData>('person', { id });
  return data ? <PersonRow person={data.person} /> : null;
}

export function PersonView({ id, embedded = false }: { id: string; embedded?: boolean }) {
  const { data, error, reload } = useApi<PersonData>('person', { id });
  const [renaming, setRenaming] = useState(false);
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return <p class="muted">Loading…</p>;
  const p = data.person;
  const vids = p.vids;

  const rename = async (e: Event) => {
    e.preventDefault();
    const value = ((e.target as HTMLFormElement).elements.namedItem('label') as HTMLInputElement).value;
    await post('label', { vids, label: value });
    setRenaming(false);
    reload();
  };
  const mark = async (isBot: boolean | null) => {
    await post('mark', { vids, is_bot: isBot });
    reload();
  };
  const remove = async () => {
    if (!confirm(`Permanently delete everything recorded about ${p.name}? This cannot be undone.`)) return;
    await post('delete', { vids });
    location.hash = '#/';
  };

  const where = [place(p.location), p.org, p.ptr].filter(Boolean);
  return (
    <>
      {!embedded && (
        <a class="back" href="#/">
          ← People
        </a>
      )}
      <header class={`dossier-head ${embedded ? 'embedded' : ''}`}>
        {!embedded &&
          (renaming ? (
            <form class="rename" onSubmit={rename}>
              <input name="label" defaultValue={p.name_source === 'label' ? p.name : ''} placeholder={p.name} maxLength={80} autofocus />
              <button class="primary small">Save</button>
              <button class="small" type="button" onClick={() => setRenaming(false)}>
                Cancel
              </button>
            </form>
          ) : (
            <h1>
              {p.name}
              <button class="link small" onClick={() => setRenaming(true)}>
                Rename
              </button>
            </h1>
          ))}
        <p class="where">{where.length ? where.join(' · ') : 'Location unknown (no geo headers or IP enrichment)'}</p>
        {!embedded && (
          <p class="facts">
            {plural(p.visits, 'visit')} on {plural(p.visit_days.length, 'day')} · {duration(p.active_seconds)} active · first seen{' '}
            {dateTime(p.first_seen)} · last seen {ago(p.last_seen)} <Dots days={p.visit_days} />
          </p>
        )}
        {p.is_bot && <p class="flag">Flagged as a bot: {p.bot_reasons ?? 'manual'}</p>}
        <div class="actions">
          {p.is_bot ? (
            <button class="small" onClick={() => mark(false)}>
              Not a bot
            </button>
          ) : (
            <button class="small" onClick={() => mark(true)}>
              Mark as bot
            </button>
          )}
          <button class="small danger" onClick={remove}>
            Delete all data
          </button>
        </div>
      </header>

      <div class="columns">
        <section class="block">
          <h2>What they looked at</h2>
          {data.attention.length ? (
            <Bars items={data.attention.slice(0, 12).map((d) => ({ key: d.key, value: d.seconds }))} />
          ) : (
            <p class="empty">No section timing. Mark sections with data-section, or call dossier.enter(key) from your app.</p>
          )}
          {data.clicks.length > 0 && (
            <>
              <h3>Clicked</h3>
              <Bars unit="count" items={data.clicks.map((c) => ({ key: c.label, value: c.count }))} />
            </>
          )}
          {data.pages.length > 1 && (
            <>
              <h3>Pages</h3>
              <Bars unit="count" items={data.pages.map((pg) => ({ key: pg.path, value: pg.visits }))} />
            </>
          )}
        </section>

        <section class="block">
          <h2>Visits</h2>
          <ul class="visits">
            {data.sessions.map((s) => (
              <VisitRow
                s={s}
                // Naming the link on every row is noise when it is the only one this person used.
                linkLabel={data.links.length > 1 ? (data.links.find((l) => l.id === s.link_id)?.label ?? null) : null}
                viaLink={Boolean(s.link_id)}
              />
            ))}
          </ul>
        </section>
      </div>

      <details class="block evidence">
        <summary>
          <h2>How these visits were grouped</h2>
        </summary>
        <p class="muted">
          {p.link_ids.length
            ? `Visits arrived through a named link (${data.links.map((l) => l.label).join(', ')}). That is the reliable signal.`
            : 'No named link, so these visits were grouped by inference: the same browser storage, and optionally a fingerprint or IP + browser match. Treat it as a good guess.'}
        </p>
        {data.evidence.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Between</th>
                <th>Shared</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.evidence.map((e) => (
                <tr>
                  <td class="mono">
                    {e.from.slice(0, 8)} ↔ {e.vid.slice(0, 8)}
                  </td>
                  <td>
                    {[e.sharedCookie && 'session cookie', e.sharedFingerprint && 'fingerprint', e.sharedNetwork && 'IP + browser']
                      .filter(Boolean)
                      .join(', ')}
                  </td>
                  <td>{Math.round(e.confidence * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <table>
          <thead>
            <tr>
              <th>IP address</th>
              <th>Network</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {data.ips.map((ip) => (
              <tr>
                <td class="mono">{ip.ip}</td>
                <td>{[ip.org, ip.ptr].filter(Boolean).join(' · ') || '—'}</td>
                <td>{ago(ip.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="muted small mono">visitor ids: {data.visitors.map((v) => v.vid).join(', ')}</p>
      </details>
    </>
  );
}

function VisitRow({ s, linkLabel, viaLink }: { s: Session; linkLabel: string | null; viaLink: boolean }) {
  const via = linkLabel
    ? `via ${linkLabel}`
    : viaLink
      ? s.referrer_host && `from ${s.referrer_host}`
      : s.ref_tag
        ? `?to=${s.ref_tag}`
        : s.referrer_host
          ? `from ${s.referrer_host}`
          : 'direct';
  return (
    <li>
      <a href={href('s', s.sid)} class={s.is_bot ? 'bot' : ''}>
        <span class="when">{dateTime(s.started_at)}</span>
        <span class="dur">{duration(s.active_seconds)}</span>
        <span class="detail">
          {s.sections.slice(0, 3).map((d) => `${d.key} ${duration(d.seconds)}`).join(' · ') || s.page || '/'}
          <span class="sub">
            {[via, device(s.device), place(s.location), s.max_scroll_pct != null && `scrolled ${s.max_scroll_pct}%`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        {s.has_replay && <span class="tag">Replay</span>}
      </a>
    </li>
  );
}

type TimelineEvent = {
  ts: string;
  type: string;
  data: Record<string, unknown> | null;
  /** Events the server folded into this one because they came from the same user action. */
  also?: Array<{ type: string; data: Record<string, unknown> | null }>;
};

type SessionData = {
  session: Session;
  events: Array<TimelineEvent>;
  replay: { chunks: number; bytes: number };
};

function describe(e: SessionData['events'][number]): string {
  const d = e.data ?? {};
  const s = (k: string) => (typeof d[k] === 'string' || typeof d[k] === 'number' ? String(d[k]) : '');
  switch (e.type) {
    case 'visit':
      return `Arrived${s('path') ? ` on ${s('path')}` : s('title') ? ` on “${s('title')}”` : ''}`;
    case 'section_view':
      return `Viewed ${s('section')}`;
    case 'section_enter':
      return `Opened ${s('section')}`;
    case 'scroll_depth':
      return `Scrolled ${s('pct')}%`;
    case 'click_target': {
      const link = s('host') ? ` (${s('host')}${s('path')})` : '';
      const opened = e.also?.some((a) => a.type === 'open_overlay') ? ', which opened it' : '';
      const followed = e.also?.find((a) => a.type === 'click_link');
      const to = followed ? ` (${String(followed.data?.host ?? '')}${String(followed.data?.path ?? '')})` : '';
      return `Clicked ${s('target')}${link || to}${opened}`;
    }
    case 'click_link':
      return `Clicked a link to ${s('host')}${s('path')}`;
    case 'hover':
      return `Hovered ${s('target')} (${Math.round(Number(d.ms ?? 0) / 100) / 10}s)`;
    case 'pageview':
      return `Went to ${s('path')}`;
    case 'js_error':
      return `JavaScript error: ${s('message')}`;
    case 'idle_start':
      return 'Went idle';
    case 'perf':
      return `Page loaded in ${(Number(d.load_ms ?? 0) / 1000).toFixed(1)}s`;
    case 'open_overlay':
      return `Opened ${s('overlay')}`;
    case 'close_overlay':
      return `Closed ${s('overlay')}${d.open_seconds != null ? ` after ${duration(Number(d.open_seconds))}` : ''}`;
    case 'fingerprint_ready':
      return 'Fingerprint computed';
    default: {
      const keys = Object.entries(d)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(', ');
      return `${e.type}${keys ? ` (${keys})` : ''}`;
    }
  }
}

const QUIET = new Set(['focus', 'blur', 'visibility', 'idle_end', 'fingerprint_ready', 'hover_start']);

export function SessionView({ sid }: { sid: string }) {
  const { data, error } = useApi<SessionData>('session', { sid });
  const [seek, setSeek] = useState<number | null>(null);
  if (error) return <p class="error">{error.message}</p>;
  if (!data) return <p class="muted">Loading…</p>;
  const s = data.session;
  const start = Date.parse(data.events[0]?.ts ?? s.started_at);
  const events = data.events.filter((e) => !QUIET.has(e.type));
  return (
    <>
      <a class="back" href={href('p', s.vid)}>
        ← Back to person
      </a>
      <header class="dossier-head">
        <h1>{dateTime(s.started_at)}</h1>
        <p class="facts">
          {duration(s.active_seconds)} active of {duration(s.session_seconds)} · {plural(s.interactions, 'interaction')} ·{' '}
          {[device(s.device), s.device.screen, place(s.location)].filter(Boolean).join(' · ')}
        </p>
        {s.is_bot && <p class="flag">Bot (score {s.bot_score}): {s.bot_reasons}</p>}
      </header>
      <div class={data.replay.chunks ? 'session-grid' : ''}>
        {data.replay.chunks > 0 && <Replay sid={sid} seekTo={seek} size={data.replay.bytes} />}
        <section class="block">
          <h2>Timeline</h2>
          <ol class="timeline">
            {events.map((e) => {
              const offset = Date.parse(e.ts) - start;
              return (
                <li>
                  <button class="t" onClick={() => setSeek(offset)} disabled={!data.replay.chunks} title={clock(e.ts)}>
                    {duration(offset / 1000)}
                  </button>
                  <span class={`ev ${e.type}`}>{describe(e)}</span>
                </li>
              );
            })}
          </ol>
          {!data.replay.chunks && <p class="muted small">No replay for this visit (replay is off or this session was not sampled).</p>}
        </section>
      </div>
    </>
  );
}

type Player = { goto: (ms: number, play?: boolean) => void; $destroy?: () => void };
declare global {
  interface Window {
    rrwebPlayer?: new (opts: { target: HTMLElement; props: Record<string, unknown> }) => Player;
  }
}

function loadOnce(tag: 'script' | 'link', url: string): Promise<void> {
  if (document.querySelector(`[data-src="${url}"]`)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const el = document.createElement(tag);
    el.setAttribute('data-src', url);
    if (el instanceof HTMLScriptElement) el.src = url;
    else Object.assign(el, { rel: 'stylesheet', href: url });
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`failed to load ${url}`));
    document.head.appendChild(el);
  });
}

function Replay({ sid, seekTo, size }: { sid: string; seekTo: number | null; size: number }) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [status, setStatus] = useState(`Loading replay (${bytes(size)})…`);
  useEffect(() => {
    let live = true;
    (async () => {
      const base = location.pathname;
      await Promise.all([loadOnce('link', `${base}?asset=player.css`), loadOnce('script', `${base}?asset=player.js`)]);
      const events: unknown[] = [];
      let from = 0;
      for (let i = 0; i < 200; i++) {
        const res = await fetch(`${base}?api=replay&sid=${encodeURIComponent(sid)}&from=${from}`, { credentials: 'same-origin' });
        const page = (await res.json()) as { events: unknown[]; next: number | null; done: boolean };
        events.push(...page.events);
        if (page.done || page.next == null) break;
        from = page.next;
      }
      if (!live || !host.current || !window.rrwebPlayer) return;
      if (events.length < 2) {
        setStatus('Replay has too few events to play.');
        return;
      }
      const width = host.current.clientWidth;
      player.current = new window.rrwebPlayer({
        target: host.current,
        props: { events, width, height: Math.round(Math.min(width * 0.62, innerHeight * 0.6)), autoPlay: false, skipInactive: true, showController: true },
      });
      setStatus('');
    })().catch((err: Error) => live && setStatus(`Could not load replay: ${err.message}`));
    return () => {
      live = false;
      player.current?.$destroy?.();
      player.current = null;
    };
  }, [sid]);
  useEffect(() => {
    if (seekTo != null) player.current?.goto(Math.max(0, seekTo), false);
  }, [seekTo]);
  return (
    <section class="block replay">
      <h2>Replay</h2>
      {status && <p class="muted">{status}</p>}
      <div ref={host} class="player" />
    </section>
  );
}

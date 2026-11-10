import type { Dwell } from '../src/protocol.js';
import type { LinkSummary, PersonSummary } from '../src/server/admin/people.js';
import { ago, date, device, duration, href, place, plural } from './lib.js';

/** One dot per day in the last 14 days; filled when there was a visit. Shows "came back" at a glance. */
export function Dots({ days }: { days: string[] }) {
  const set = new Set(days);
  const cells = [];
  const today = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    cells.push(<i class={set.has(key) ? 'on' : ''} title={key} />);
  }
  return (
    <span class="dots" aria-label={`Visited on ${days.length} ${days.length === 1 ? 'day' : 'days'}`}>
      {cells}
    </span>
  );
}

export function Looked({ top }: { top: Dwell[] }) {
  if (!top.length) return <span class="muted">no section data</span>;
  return (
    <span class="looked">
      {top.slice(0, 3).map((d, i) => (
        <span>
          {i > 0 && <span class="sep">·</span>}
          {d.key} <b>{duration(d.seconds)}</b>
        </span>
      ))}
    </span>
  );
}

export function LinkRow({ link }: { link: LinkSummary }) {
  return (
    <li>
      <a class={`row ${link.opened ? '' : 'pending'}`} href={href('l', link.id)}>
        <span class={`state ${link.opened ? 'yes' : 'no'}`} aria-hidden="true" />
        <span class="who">
          <strong>{link.label}</strong>
          <span class="sub">
            {link.opened ? (
              <>
                Opened {ago(link.first_opened_at)}
                {link.visits > 1 && ` · ${plural(link.visits, 'visit')}`}
                {link.visit_days.length > 1 && ` on ${link.visit_days.length} days`}
                {link.people > 1 && ` · ${link.people} people`}
              </>
            ) : (
              <>Not opened yet · created {date(link.created_at)}</>
            )}
          </span>
        </span>
        {link.opened ? (
          <>
            <span class="time">{duration(link.active_seconds)}</span>
            <span class="what">
              <Looked top={link.top} />
              <span class="sub">{[place(link.location), device(link.device)].filter(Boolean).join(' · ')}</span>
            </span>
            <span class="when">
              <span>{ago(link.last_seen)}</span>
              <Dots days={link.visit_days} />
            </span>
          </>
        ) : (
          <>
            <span class="time muted">–</span>
            <span class="what muted mono">?to={link.slug}</span>
          </>
        )}
      </a>
    </li>
  );
}

export function PersonRow({ person: p }: { person: PersonSummary }) {
  return (
    <li>
      <a class="row" href={href('p', p.id)}>
        <span class={`state ${p.is_bot ? 'bot' : 'yes'}`} aria-hidden="true" />
        <span class="who">
          <strong class={p.name_source === 'pseudonym' ? 'pseudo' : ''}>{p.name}</strong>
          <span class="sub">
            {[place(p.location), p.org].filter(Boolean).join(' · ') || 'Unknown location'}
          </span>
        </span>
        <span class="time">{duration(p.active_seconds)}</span>
        <span class="what">
          <Looked top={p.top} />
          <span class="sub">
            {[plural(p.visits, 'visit'), device(p.device), p.referrer_host && `via ${p.referrer_host}`, p.has_replay && 'replay']
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <span class="when">
          <span>{ago(p.last_seen)}</span>
          <Dots days={p.visit_days} />
        </span>
      </a>
    </li>
  );
}

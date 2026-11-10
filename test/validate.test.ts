import { describe, expect, it } from 'vitest';
import { LIMITS, parseCollect, parseReplay } from '../src/server/validate.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const base = { vid: 'visitor-123', sid: 'session-456' };

describe('parseCollect', () => {
  it('requires well-formed vid and sid', () => {
    expect(parseCollect({}).ok).toBe(false);
    expect(parseCollect({ vid: 'x', sid: 'session-456' }).ok).toBe(false); // too short
    expect(parseCollect({ vid: 'has spaces!', sid: 'session-456' }).ok).toBe(false);
    expect(parseCollect('nope').ok).toBe(false);
    expect(parseCollect(base).ok).toBe(true);
  });

  it('rejects oversized batches and drops malformed events', () => {
    const many = Array.from({ length: LIMITS.eventsPerRequest + 1 }, () => ({ type: 'click' }));
    expect(parseCollect({ ...base, events: many })).toEqual({ ok: false, error: 'too many events' });
    const r = parseCollect({ ...base, events: [{ type: 'ok_event' }, { type: '<script>' }, { type: 5 }, null, 'x'] }, NOW);
    expect(r.ok && r.value.events.map((e) => e.type)).toEqual(['ok_event']);
  });

  it('clamps client timestamps to a sane window', () => {
    const r = parseCollect(
      {
        ...base,
        events: [
          { type: 'a', ts: '2026-11-10T11:59:00Z' },
          { type: 'b', ts: '1999-01-01T00:00:00Z' },
          { type: 'c', ts: '2030-01-01T00:00:00Z' },
          { type: 'd', ts: 'garbage' },
        ],
      },
      NOW,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.value.events.map((e) => e.ts.toISOString())).toEqual([
      '2026-11-10T11:59:00.000Z',
      '2026-11-10T12:00:00.000Z',
      '2026-11-10T12:00:00.000Z',
      '2026-11-10T12:00:00.000Z',
    ]);
  });

  it('bounds event data size and strips NUL characters', () => {
    const big = { blob: 'x'.repeat(LIMITS.eventDataBytes) };
    const r = parseCollect({ ...base, events: [{ type: 'big', data: big }, { type: 'nul', data: { s: 'a\u0000b' } }, { type: 'arr', data: [1] }] });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.events[0]!.data).toEqual({ truncated: true });
    expect(r.value.events[1]!.data).toEqual({ s: 'ab' });
    expect(r.value.events[2]!.data).toBeNull();
  });

  it('normalizes pages and referrers, rejecting non-http schemes', () => {
    const r = parseCollect({
      ...base,
      page: 'https://example.com/work?x=1#frag',
      referrer: 'javascript:alert(1)',
      summary: { pages: ['/a', 'https://example.com/b', 'not a url'] },
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.page).toBe('/work?x=1');
    expect(r.value.referrer).toBeNull();
    expect(r.value.summary?.pages).toEqual(['/a', '/b']);
  });

  it('clamps summary numbers and dwell lists', () => {
    const r = parseCollect({
      ...base,
      summary: {
        active_seconds: -5,
        session_seconds: 1e12,
        interactions: 3.6,
        max_scroll_pct: 140,
        sections: [{ key: 'projects', seconds: 12.4 }, { key: '', seconds: 3 }, { key: 'x'.repeat(200), seconds: 1 }, 'junk'],
      },
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.summary).toMatchObject({ activeSeconds: 0, sessionSeconds: LIMITS.maxSeconds, interactions: 4, maxScrollPct: 100 });
    expect(r.value.summary?.sections).toEqual([
      { key: 'projects', seconds: 12 },
      { key: 'x'.repeat(80), seconds: 1 },
    ]);
  });

  it('keeps the link tag, cleaned and bounded', () => {
    const r = parseCollect({ ...base, ref_tag: '  colgate-admissions\u0007 ' });
    expect(r.ok && r.value.refTag).toBe('colgate-admissions');
  });

  it('only trusts the client fields it understands', () => {
    const r = parseCollect({ ...base, client: { webdriver: 'yes', screen: '1440x900', tz: 'America/New_York', evil: 1 } });
    expect(r.ok && r.value.client).toEqual({ webdriver: false, screen: '1440x900', tz: 'America/New_York', lang: null });
  });
});

describe('parseReplay', () => {
  it('keeps only rrweb-shaped events', () => {
    const r = parseReplay({ ...base, chunk_seq: 2, events: [{ type: 2, timestamp: 1 }, { type: 'x', timestamp: 1 }, { foo: 1 }] });
    expect(r).toEqual({ ok: true, value: { vid: base.vid, sid: base.sid, chunkSeq: 2, events: [{ type: 2, timestamp: 1 }] } });
  });

  it('rejects oversized chunks', () => {
    const events = Array.from({ length: LIMITS.replayEventsPerRequest + 1 }, (_, i) => ({ type: 3, timestamp: i }));
    expect(parseReplay({ ...base, events }).ok).toBe(false);
  });
});

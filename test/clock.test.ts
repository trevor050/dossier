import { describe, expect, it } from 'vitest';
import { ActivityClock, DwellCounter } from '../src/client/clock.js';

const s = (n: number) => n * 1000;

describe('ActivityClock', () => {
  it('counts presence as active until the idle threshold, then stops', () => {
    const c = new ActivityClock(0, s(30));
    c.activity(s(10), true);
    // 10s of activity + 30s grace after the last sign of life = 40s active, even at t=100s.
    expect(c.snapshot(s(100))).toMatchObject({ session_seconds: 100, active_seconds: 40, idle_seconds: 60, interactions: 1 });
  });

  it('starts a new active segment after an idle gap', () => {
    const c = new ActivityClock(0, s(30));
    c.activity(s(100));
    c.activity(s(110));
    // [0,30] from the initial view, then [100,140] capped at now=120 -> 30 + 20.
    expect(c.snapshot(s(120)).active_seconds).toBe(50);
    expect(c.isIdle(s(120))).toBe(false);
    expect(c.isIdle(s(200))).toBe(true);
  });

  it('stops counting while the tab is hidden', () => {
    const c = new ActivityClock(0, s(30));
    c.activity(s(5));
    c.setVisible(false, s(10));
    c.activity(s(20), true); // keystrokes while hidden do not count as presence
    c.setVisible(true, s(60));
    expect(c.snapshot(s(70)).active_seconds).toBe(20); // [0,10] + [60,70]
    expect(c.snapshot(s(70)).interactions).toBe(1);
  });

  it('starts idle when the page loads in a background tab', () => {
    const c = new ActivityClock(0, s(30), false);
    expect(c.snapshot(s(50)).active_seconds).toBe(0);
  });

  it('records time to first interaction', () => {
    const c = new ActivityClock(0);
    c.activity(s(3));
    c.activity(s(7), true);
    c.activity(s(9), true);
    expect(c.snapshot(s(10)).first_interaction_seconds).toBe(7);
  });
});

describe('DwellCounter', () => {
  it('credits active time to the visible section', () => {
    const d = new DwellCounter();
    d.credit(s(5), 'intro');
    d.credit(s(12), 'projects');
    d.credit(s(12), 'projects'); // no new active time
    expect(d.list()).toEqual([
      { key: 'projects', seconds: 7 },
      { key: 'intro', seconds: 5 },
    ]);
  });

  it('lets enter()/leave() override DOM sections (modals, canvas scenes)', () => {
    const d = new DwellCounter();
    d.enter('resume');
    d.credit(s(4), 'intro');
    d.enter('contact');
    d.credit(s(6), 'intro');
    d.leave('contact');
    d.credit(s(9), 'intro');
    d.leave();
    d.credit(s(10), 'intro');
    expect(Object.fromEntries(d.list().map((x) => [x.key, x.seconds]))).toEqual({ resume: 7, contact: 2, intro: 1 });
  });
});

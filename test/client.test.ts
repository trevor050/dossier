// @vitest-environment happy-dom
import { Storage } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initDossier, isOptedOut, optIn, type Dossier } from '../src/client/index.js';

// Node 25+ defines its own global localStorage/sessionStorage, which are unusable without
// --localstorage-file and shadow the ones happy-dom would provide. Use happy-dom's explicitly
// so the browser-side tests behave the same on every supported Node version.
const nodeShadowsStorage = (name: 'localStorage' | 'sessionStorage') => {
  try {
    return typeof (globalThis as Record<string, unknown>)[name] === 'undefined';
  } catch {
    return true;
  }
};
// Defined directly rather than with vi.stubGlobal, because afterEach calls vi.unstubAllGlobals().
for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (nodeShadowsStorage(name)) {
    Object.defineProperty(globalThis, name, { value: new Storage(), configurable: true, writable: true });
  }
}

type Sent = { url: string; body: Record<string, unknown> };
let sent: Sent[];
let handle: Dossier | null = null;

function setUrl(path: string) {
  history.replaceState(null, '', path);
}

function setNavigator(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(navigator, k, { value: v, configurable: true });
}

beforeEach(() => {
  sent = [];
  localStorage.clear();
  sessionStorage.clear();
  setNavigator({ globalPrivacyControl: false, doNotTrack: null, sendBeacon: undefined });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    }),
  );
});

afterEach(() => {
  handle?.stop();
  handle = null;
  vi.unstubAllGlobals();
});

describe('initDossier', () => {
  it('captures the ?to= link tag, strips it from the address bar and keeps everything else', async () => {
    setUrl('/work?to=colgate-admissions&tab=2#projects');
    handle = initDossier({ sections: false });
    expect(handle.enabled).toBe(true);
    expect(location.pathname + location.search + location.hash).toBe('/work?tab=2#projects');
    await handle.flush();
    expect(sent[0]!.url).toBe('/api/collect');
    expect(sent[0]!.body).toMatchObject({ ref_tag: 'colgate-admissions', page: '/work?tab=2' });
    expect((sent[0]!.body.events as Array<{ type: string }>)[0]!.type).toBe('visit');
  });

  it('remembers the tag for return visits from the same browser', async () => {
    setUrl('/?to=k7m2xq4');
    initDossier({ sections: false }).stop();
    sessionStorage.clear();
    setUrl('/');
    sent = [];
    handle = initDossier({ sections: false });
    await handle.flush();
    expect(sent.at(-1)!.body.ref_tag).toBe('k7m2xq4');
  });

  it('reuses the visitor id from Dossier 0.1 storage', async () => {
    localStorage.setItem('visit_vid', 'legacy-visitor-1');
    setUrl('/');
    handle = initDossier({ sections: false });
    await handle.flush();
    expect(sent[0]!.body.vid).toBe('legacy-visitor-1');
  });

  it('honors Global Privacy Control and Do Not Track by default', () => {
    setNavigator({ globalPrivacyControl: true });
    setUrl('/?to=someone');
    expect(initDossier().enabled).toBe(false);
    expect(localStorage.length).toBe(0); // nothing written for a GPC browser
    expect(location.search).toBe(''); // but the tag is still removed from the URL
    setNavigator({ globalPrivacyControl: false, doNotTrack: '1' });
    expect(initDossier().enabled).toBe(false);
    expect(initDossier({ respectPrivacySignals: false, sections: false }).enabled).toBe(true);
  });

  it('supports a persistent opt-out via ?dossier=off, and back in via ?dossier=on', () => {
    setUrl('/?dossier=off');
    expect(initDossier().enabled).toBe(false);
    expect(location.search).toBe('');
    expect(isOptedOut()).toBe(true);
    setUrl('/');
    expect(initDossier().enabled).toBe(false);
    setUrl('/?dossier=on');
    handle = initDossier({ sections: false });
    expect(handle.enabled).toBe(true);
    expect(isOptedOut()).toBe(false);
  });

  it('respects ignore()', () => {
    expect(initDossier({ ignore: () => true }).enabled).toBe(false);
    expect(initDossier({ ignore: true }).enabled).toBe(false);
  });

  it('sends custom events and attributes time to entered keys', async () => {
    setUrl('/');
    handle = initDossier({ sections: false });
    handle.track('download_resume', { format: 'pdf' });
    handle.enter('resume-overlay');
    await handle.flush();
    const types = sent.flatMap((s) => (s.body.events as Array<{ type: string }>).map((e) => e.type));
    expect(types).toEqual(expect.arrayContaining(['visit', 'download_resume', 'section_enter']));
    expect(sent.at(-1)!.body.summary).toMatchObject({ interactions: 0 });
    optIn();
  });
});

describe('canvas apps that report sections with enter()/leave() (sections: false)', () => {
  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    Object.defineProperty(document, 'hidden', { value: state === 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  const lastSummary = () => {
    const withSummary = sent.filter((s) => s.body.summary);
    return withSummary[withSummary.length - 1]!.body.summary as {
      pageview_id: string;
      seq: number;
      active_seconds: number;
      sections: Array<{ key: string; seconds: number }>;
    };
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    setVisibility('visible');
    setUrl('/');
  });
  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
  });

  /** Advance time with a sign of life every 10s, so the visitor never counts as idle. */
  const present = (seconds: number) => {
    for (let t = 0; t < seconds; t += 10) {
      window.dispatchEvent(new Event('pointermove'));
      vi.advanceTimersByTime(Math.min(10, seconds - t) * 1000);
    }
  };

  it('does not count time while the tab is hidden, and resumes the open section when shown', () => {
    handle = initDossier({ sections: false });
    handle.enter('projects');
    present(20);
    setVisibility('hidden'); // summary sent here
    vi.advanceTimersByTime(300_000); // five minutes in another tab
    setVisibility('visible');
    present(10);
    handle.leave('projects');
    handle.enter('resume');
    present(5);
    setVisibility('hidden');
    const s = lastSummary();
    expect(s.sections).toEqual([
      { key: 'projects', seconds: 30 },
      { key: 'resume', seconds: 5 },
    ]);
    expect(s.active_seconds).toBe(35);
  });

  it('credits the open section up to the moment the page closes, without leave()', () => {
    handle = initDossier({ sections: false });
    handle.enter('resume');
    present(12);
    window.dispatchEvent(new Event('pagehide'));
    expect(lastSummary().sections).toEqual([{ key: 'resume', seconds: 12 }]);
  });

  it('identifies the page load and numbers its summaries so the server keeps only the latest', () => {
    handle = initDossier({ sections: false });
    present(3);
    setVisibility('hidden');
    const first = lastSummary();
    setVisibility('visible');
    present(3);
    window.dispatchEvent(new Event('pagehide'));
    const second = lastSummary();
    expect(second.pageview_id).toBe(first.pageview_id);
    expect(second.seq).toBeGreaterThan(first.seq);
    expect(second.active_seconds).toBeGreaterThan(first.active_seconds);
  });

  it('reports a click on a tracked link as one event', async () => {
    handle = initDossier({ sections: false });
    document.body.innerHTML = '<a href="https://github.com/trevor050" data-track="github">GitHub</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await handle.flush();
    const clicks = sent.flatMap((s) => s.body.events as Array<{ type: string; data: Record<string, unknown> }>).filter((e) => e.type.startsWith('click'));
    expect(clicks).toEqual([expect.objectContaining({ type: 'click_target', data: expect.objectContaining({ target: 'github', host: 'github.com' }) })]);
  });
});

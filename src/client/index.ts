import type { CollectBody, WireEvent, WireSummary } from '../protocol.js';
import { VERSION } from '../version.js';
import { ActivityClock, DwellCounter } from './clock.js';
import { applyOptParam, isOptedOut, OPT_PARAM, optOut, privacySignal } from './privacy.js';

export { optIn, optOut, isOptedOut } from './privacy.js';

export type ReplayOptions = {
  /** Fraction of sessions to record, 0..1. */
  sampleRate: number;
  /** Mask every input value (default true). */
  maskAllInputs?: boolean;
  /** Elements whose text is masked (default `[data-dossier-mask]`). */
  maskTextSelector?: string;
  /** Elements that are not recorded at all (default `[data-dossier-block]`). */
  blockSelector?: string;
  /** Record <canvas> frames (heavy; off by default). */
  recordCanvas?: boolean;
};

export type DossierOptions = {
  /** Collector URL. Default `/api/collect`. */
  endpoint?: string;
  /** Turn tracking off, e.g. `() => import.meta.env.DEV`. */
  ignore?: boolean | (() => boolean);
  /** Skip visitors whose browser sends Global Privacy Control or Do Not Track. Default true. */
  respectPrivacySignals?: boolean;
  /** Query parameter(s) that carry a named-link tag. Default `['to', 'ref']`. */
  linkParam?: string | string[];
  /** Remove the link tag (and `?dossier=`) from the address bar after reading it. Default true. */
  stripParams?: boolean;
  /** Elements whose on-screen time is measured. Default `[data-section], section[id]`. `false` disables. */
  sections?: string | false;
  /** Session replay. Off unless a sample rate is given. */
  replay?: number | ReplayOptions | false;
  /** FingerprintJS (open source) visitor id, used to link visits across cleared storage. Default false. */
  fingerprint?: boolean;
  /** Inactivity after which time stops counting as active. Default 30s. */
  idleAfterMs?: number;
  /** Where the long-lived visitor id lives. Default `localStorage`. */
  persist?: 'localStorage' | 'cookie';
};

export type Dossier = {
  /** Whether this page view is being tracked. */
  readonly enabled: boolean;
  /** Record a custom event, e.g. `track('download_resume', { format: 'pdf' })`. */
  track(type: string, data?: Record<string, unknown>): void;
  /** Start attributing time to `key` (a modal, overlay, canvas scene...). Overrides DOM sections until `leave`. */
  enter(key: string): void;
  /** Stop attributing time to `key` (or the most recent `enter`). */
  leave(key?: string): void;
  /** Send queued events now. */
  flush(): Promise<void>;
  /** Stop tracking this browser on this site, permanently. */
  optOut(): void;
  /** Detach listeners and stop. */
  stop(): void;
};

declare global {
  interface Window {
    __dossierRecord?: (opts: Record<string, unknown>) => (() => void) | undefined;
    __dossierFingerprint?: { load: () => Promise<{ get: () => Promise<{ visitorId: string }> }> };
  }
}

const K = {
  vid: 'dossier_vid',
  legacyVid: 'visit_vid',
  sid: 'dossier_sid',
  sidSeen: 'dossier_sid_seen',
  replay: 'dossier_replay',
  tag: 'dossier_to',
  fp: 'dossier_fpid',
  scid: 'dossier_scid',
};
const SESSION_GAP_MS = 30 * 60_000;
const ID_RE = /^[A-Za-z0-9_-]{6,128}$/;

const noop: Dossier = {
  enabled: false,
  track() {},
  enter() {},
  leave() {},
  flush: () => Promise.resolve(),
  optOut,
  stop() {},
};

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function randomId(): string {
  return safe(() => crypto.randomUUID(), `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`);
}

function readCookie(name: string): string | null {
  for (const part of document.cookie ? document.cookie.split('; ') : []) {
    if (part.startsWith(`${name}=`)) return decodeURIComponent(part.slice(name.length + 1));
  }
  return null;
}

function writeCookie(name: string, value: string, maxAgeSeconds?: number) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const age = maxAgeSeconds ? `; Max-Age=${maxAgeSeconds}` : '';
  document.cookie = `${name}=${encodeURIComponent(value)}${age}; Path=/; SameSite=Lax${secure}`;
}

function withQuery(endpoint: string, params: Record<string, string>): string {
  const url = new URL(endpoint, location.href);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.origin === location.origin ? url.pathname + url.search : url.toString();
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

function trimLong(v: string | null | undefined, max: number): string | undefined {
  if (!v) return undefined;
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * Read the named-link tag and apply `?dossier=off|on`, then remove both from the
 * address bar. The tag is only persisted when tracking is actually enabled.
 */
function readParams(params: string[], strip: boolean): { tag: string | null; clean: () => void } {
  const url = new URL(location.href);
  let tag: string | null = null;
  for (const p of params) {
    const v = url.searchParams.get(p);
    if (v && !tag) tag = v.trim().slice(0, 120) || null;
  }
  const optParam = applyOptParam(url);
  const clean = () => {
    if (!strip || (!tag && !optParam)) return;
    for (const p of [...params, OPT_PARAM]) url.searchParams.delete(p);
    safe(() => history.replaceState(history.state, '', url.pathname + url.search + url.hash), undefined);
  };
  return { tag, clean };
}

/**
 * Start tracking. Returns a handle for custom events and section attribution.
 * Safe to call during SSR (returns a no-op) and never throws.
 */
export function initDossier(options: DossierOptions = {}): Dossier {
  if (typeof window === 'undefined' || typeof document === 'undefined') return noop;
  try {
    return start(options);
  } catch {
    return noop;
  }
}

function start(options: DossierOptions): Dossier {
  const linkParams = Array.isArray(options.linkParam) ? options.linkParam : [options.linkParam ?? 'to', ...(options.linkParam ? [] : ['ref'])];
  const params = readParams(linkParams, options.stripParams !== false);
  params.clean();

  const ignore = options.ignore;
  const ignored = () => (typeof ignore === 'function' ? safe(ignore, true) : ignore === true);
  // Disabled browsers get no storage writes at all.
  if (ignored() || isOptedOut() || (options.respectPrivacySignals !== false && privacySignal())) return noop;

  if (params.tag) safe(() => localStorage.setItem(K.tag, params.tag!), undefined);
  const tag = params.tag ?? safe(() => localStorage.getItem(K.tag), null);

  const endpoint = options.endpoint ?? '/api/collect';
  const replayEndpoint = withQuery(endpoint, { kind: 'replay' });
  const persist = options.persist ?? 'localStorage';
  const idleAfterMs = options.idleAfterMs ?? 30_000;
  const sectionSelector = options.sections === false ? null : (options.sections ?? '[data-section], section[id]');
  const replayOpts: ReplayOptions | null =
    typeof options.replay === 'number'
      ? { sampleRate: options.replay }
      : options.replay && typeof options.replay === 'object'
        ? options.replay
        : null;

  // ---- identity -----------------------------------------------------------
  const vid = (() => {
    const existing =
      persist === 'cookie'
        ? readCookie(K.vid)
        : safe(() => localStorage.getItem(K.vid) ?? localStorage.getItem(K.legacyVid), null);
    const id = existing && ID_RE.test(existing) ? existing : randomId();
    if (persist === 'cookie') writeCookie(K.vid, id, 60 * 60 * 24 * 365);
    else safe(() => localStorage.setItem(K.vid, id), undefined);
    return id;
  })();

  const now = () => Date.now();
  let sid = safe(() => sessionStorage.getItem(K.sid), null);
  const lastSeen = Number(safe(() => sessionStorage.getItem(K.sidSeen), null) ?? 0);
  if (!sid || !ID_RE.test(sid) || now() - lastSeen > SESSION_GAP_MS) {
    sid = randomId();
    safe(() => sessionStorage.setItem(K.sid, sid!), undefined);
    safe(() => sessionStorage.removeItem(K.replay), undefined);
  }
  const touchSession = () => safe(() => sessionStorage.setItem(K.sidSeen, String(now())), undefined);
  touchSession();

  let scid = readCookie(K.scid);
  if (!scid || !ID_RE.test(scid)) {
    scid = randomId();
    safe(() => writeCookie(K.scid, scid!), undefined);
  }
  let fpid = options.fingerprint ? safe(() => localStorage.getItem(K.fp), null) : null;

  // ---- state --------------------------------------------------------------
  const clock = new ActivityClock(now(), idleAfterMs, document.visibilityState !== 'hidden');
  const dwell = new DwellCounter();
  const queue: WireEvent[] = [];
  const pages = new Set<string>([location.pathname + location.search]);
  let seq = 0;
  let maxScroll = 0;
  const scrollMarks = new Set<number>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let firstFlush: Promise<void> | null = null;
  const cleanups: Array<() => void> = [];

  const on = <T extends EventTarget>(target: T, type: string, fn: EventListener, opts: AddEventListenerOptions = { passive: true }) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  function track(type: string, data: Record<string, unknown> = {}) {
    if (stopped) return;
    queue.push({ type, ts: new Date().toISOString(), seq: seq++, data });
    if (queue.length >= 40) void send();
    else if (!flushTimer) flushTimer = setTimeout(() => void send(), 3000);
  }

  function summary(): WireSummary {
    tick();
    return {
      ...clock.snapshot(now()),
      sections: dwell.list(),
      pages: [...pages].slice(0, 50),
      ...(maxScroll > 0 ? { max_scroll_pct: Math.round(maxScroll) } : {}),
    };
  }

  function payload(withSummary: boolean): CollectBody {
    return {
      vid,
      sid: sid!,
      scid: scid!,
      ...(fpid ? { fpid } : {}),
      ...(tag ? { ref_tag: tag } : {}),
      page: location.pathname + location.search,
      ...(document.referrer ? { referrer: trimLong(document.referrer, 1000) } : {}),
      is_mobile: safe(() => matchMedia('(max-width: 900px)').matches, false),
      orientation: safe(() => (matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'), 'landscape'),
      events: queue.splice(0, 200),
      ...(withSummary ? { summary: summary() } : {}),
      client: {
        webdriver: safe(() => navigator.webdriver === true, false),
        screen: safe(() => `${screen.width}x${screen.height}`, ''),
        tz: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, ''),
        lang: safe(() => navigator.language, ''),
      },
    };
  }

  function post(url: string, body: string, beacon: boolean): Promise<Response | null> {
    if (beacon && body.length < 60_000 && typeof navigator.sendBeacon === 'function') {
      // text/plain keeps the beacon a "simple" request (no CORS preflight).
      const ok = safe(() => navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' })), false);
      if (ok) return Promise.resolve(null);
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body,
      keepalive: body.length < 60_000,
      credentials: 'omit',
    }).catch(() => null);
  }

  function send(opts: { summary?: boolean; beacon?: boolean } = {}): Promise<void> {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (stopped || isOptedOut()) return Promise.resolve();
    if (!queue.length && !opts.summary) return Promise.resolve();
    touchSession();
    const done = post(endpoint, JSON.stringify(payload(Boolean(opts.summary))), Boolean(opts.beacon)).then(() => undefined);
    if (!firstFlush) firstFlush = done;
    return done;
  }

  // ---- sections -----------------------------------------------------------
  const visible = new Map<Element, IntersectionObserverEntry>();
  const seenSections = new Set<string>();
  const sectionKey = (el: Element) => (el.getAttribute('data-section') || el.id || '').slice(0, 80) || null;
  function domFocus(): string | null {
    // The visible section covering the most of the viewport's middle band.
    let best: { key: string; score: number } | null = null;
    const mid = innerHeight / 2;
    for (const [el] of visible) {
      const key = sectionKey(el);
      if (!key) continue;
      const r = el.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
      const score = overlap + (r.top <= mid && r.bottom >= mid ? innerHeight : 0);
      if (!best || score > best.score) best = { key, score };
    }
    return best?.key ?? null;
  }
  if (sectionSelector && typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target, e);
          else visible.delete(e.target);
        }
      },
      { threshold: [0, 0.25, 0.5] },
    );
    const observe = () => document.querySelectorAll(sectionSelector).forEach((el) => io.observe(el));
    observe();
    if (document.readyState === 'loading') on(document, 'DOMContentLoaded', observe);
    const mo = new MutationObserver(() => observe());
    safe(() => mo.observe(document.body, { childList: true, subtree: true }), undefined);
    cleanups.push(() => {
      io.disconnect();
      mo.disconnect();
    });
  }

  function tick() {
    const t = now();
    const focus = dwell.focus(domFocus());
    dwell.credit(clock.activeMsAt(t), domFocus());
    if (focus && !seenSections.has(focus) && !clock.isIdle(t)) {
      seenSections.add(focus);
      track('section_view', { section: focus });
    }
  }
  const ticker = setInterval(tick, 1000);
  cleanups.push(() => clearInterval(ticker));

  // Periodic summaries so long or crashed sessions still report their timing.
  const heartbeat = setInterval(() => {
    if (!clock.isIdle(now())) void send({ summary: true });
  }, 30_000);
  cleanups.push(() => clearInterval(heartbeat));

  // ---- activity & events --------------------------------------------------
  const presence = () => clock.activity(now());
  const interaction = () => clock.activity(now(), true);
  on(window, 'pointerdown', interaction);
  on(window, 'keydown', interaction);
  on(window, 'pointermove', presence);
  on(window, 'wheel', presence);
  on(window, 'touchmove', presence);
  on(window, 'focus', presence);
  on(window, 'scroll', () => {
    presence();
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0);
    if (height <= innerHeight) return;
    const pct = Math.min(100, ((scrollY + innerHeight) / height) * 100);
    maxScroll = Math.max(maxScroll, pct);
    for (const mark of [25, 50, 75, 100]) {
      if (pct >= mark - 1 && !scrollMarks.has(mark)) {
        scrollMarks.add(mark);
        track('scroll_depth', { pct: mark });
      }
    }
  });

  on(document, 'visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden';
    tick();
    clock.setVisible(!hidden, now());
    if (hidden) {
      void send({ summary: true, beacon: true });
      void flushReplay(true);
    }
  });
  on(window, 'pagehide', () => {
    void send({ summary: true, beacon: true });
    void flushReplay(true);
  });

  on(
    document,
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const tracked = target.closest('[data-track]');
      if (tracked) {
        track('click_target', {
          target: trimLong(tracked.getAttribute('data-track'), 120),
          group: trimLong(tracked.getAttribute('data-track-group'), 80),
        });
      }
      const a = target.closest('a');
      if (a?.href) {
        const u = safe(() => new URL(a.href), null);
        if (u && /^https?:|^mailto:|^tel:/.test(u.protocol)) {
          track('click_link', { host: u.host || u.protocol.replace(':', ''), path: trimLong(u.pathname, 300) });
        }
      }
    },
    { capture: true, passive: true },
  );

  // Hover dwell on [data-track] elements (>= 600ms).
  const hoverStart = new WeakMap<Element, number>();
  on(document, 'pointerover', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-track]') : null;
    if (el && !hoverStart.has(el)) hoverStart.set(el, now());
  });
  on(document, 'pointerout', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-track]') : null;
    const related = (e as PointerEvent).relatedTarget;
    if (!el || (related instanceof Node && el.contains(related))) return;
    const startAt = hoverStart.get(el);
    hoverStart.delete(el);
    if (startAt != null && now() - startAt >= 600) {
      track('hover', { target: trimLong(el.getAttribute('data-track'), 120), ms: now() - startAt });
    }
  });

  on(window, 'error', (e) => {
    const err = e as ErrorEvent;
    track('js_error', { message: trimLong(err.message, 300), source: trimLong(err.filename, 300), line: err.lineno ?? null });
  });
  on(window, 'unhandledrejection', (e) => {
    const reason = (e as PromiseRejectionEvent).reason;
    track('js_error', { message: trimLong(reason instanceof Error ? reason.message : String(reason), 300), unhandled: true });
  });

  // SPA navigation.
  const onNavigate = () => {
    const path = location.pathname + location.search;
    if (pages.has(path) && path === [...pages].pop()) return;
    pages.add(path);
    track('pageview', { path });
  };
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function patched(this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      safe(onNavigate, undefined);
      return result;
    };
    cleanups.push(() => {
      history[method] = original;
    });
  }
  on(window, 'popstate', onNavigate);

  // ---- fingerprint (opt-in) -----------------------------------------------
  if (options.fingerprint && !fpid) {
    void loadScript(withQuery(endpoint, { asset: 'fingerprint', v: VERSION }))
      .then(() => window.__dossierFingerprint?.load())
      .then((agent) => agent?.get())
      .then((res) => {
        const id = res?.visitorId;
        if (!id || !ID_RE.test(id)) return;
        fpid = id;
        safe(() => localStorage.setItem(K.fp, id), undefined);
        track('fingerprint_ready');
      })
      .catch(() => {});
  }

  // ---- replay (opt-in, sampled per session) --------------------------------
  const replayQueue: unknown[] = [];
  let replayChunk = 0;
  let replayStop: (() => void) | undefined;
  let replayTimer: ReturnType<typeof setTimeout> | null = null;
  let replayOn = false;

  function flushReplay(beacon = false): Promise<void> {
    if (replayTimer) {
      clearTimeout(replayTimer);
      replayTimer = null;
    }
    if (!replayOn || !replayQueue.length) return Promise.resolve();
    const body = JSON.stringify({ vid, sid, chunk_seq: replayChunk++, events: replayQueue.splice(0, 2000) });
    return post(replayEndpoint, body, beacon).then((res) => {
      // 413/429: over the per-session budget or unknown session. Stop recording.
      if (res && (res.status === 413 || res.status === 429)) stopReplay();
    });
  }

  function stopReplay() {
    replayOn = false;
    replayQueue.length = 0;
    safe(() => replayStop?.(), undefined);
    replayStop = undefined;
  }

  if (replayOpts && replayOpts.sampleRate > 0) {
    const decided = safe(() => sessionStorage.getItem(K.replay), null);
    const record = decided ? decided === '1' : Math.random() < replayOpts.sampleRate;
    safe(() => sessionStorage.setItem(K.replay, record ? '1' : '0'), undefined);
    if (record) {
      replayOn = true;
      void loadScript(withQuery(endpoint, { asset: 'recorder', v: VERSION }))
        .then(() => firstFlush ?? Promise.resolve())
        .then(() => {
          if (!replayOn || !window.__dossierRecord) return;
          replayStop = window.__dossierRecord({
            emit: (event: unknown) => {
              if (!replayOn) return;
              replayQueue.push(event);
              if (replayQueue.length >= 150) void flushReplay();
              else if (!replayTimer) replayTimer = setTimeout(() => void flushReplay(), 5000);
            },
            maskAllInputs: replayOpts.maskAllInputs ?? true,
            maskTextSelector: replayOpts.maskTextSelector ?? '[data-dossier-mask]',
            blockSelector: replayOpts.blockSelector ?? '[data-dossier-block]',
            recordCanvas: replayOpts.recordCanvas ?? false,
            sampling: { mousemove: 50, scroll: 150, input: 'last', ...(replayOpts.recordCanvas ? { canvas: 2 } : {}) },
            ...(replayOpts.recordCanvas ? { dataURLOptions: { type: 'image/webp', quality: 0.5 } } : {}),
          });
        })
        .catch(() => stopReplay());
    }
  }

  // ---- go -----------------------------------------------------------------
  track('visit', { title: trimLong(document.title, 200) });
  void send();
  on(
    window,
    'load',
    () => {
      const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
      if (nav) track('perf', { ttfb_ms: Math.round(nav.responseStart), load_ms: Math.round(nav.loadEventStart) });
    },
    { once: true, passive: true },
  );

  return {
    enabled: true,
    track,
    enter(key: string) {
      tick();
      const k = key.slice(0, 80);
      dwell.enter(k);
      clock.activity(now());
      track('section_enter', { section: k });
    },
    leave(key?: string) {
      tick();
      dwell.leave(key?.slice(0, 80));
    },
    flush: () => send({ summary: true }),
    optOut() {
      optOut();
      stopped = true;
      stopReplay();
      for (const c of cleanups.splice(0)) safe(c, undefined);
    },
    stop() {
      void send({ summary: true, beacon: true });
      void flushReplay(true);
      stopped = true;
      stopReplay();
      for (const c of cleanups.splice(0)) safe(c, undefined);
    },
  };
}


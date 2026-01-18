type TelemetryEvent = { type: string; ts: string; seq: number; data?: Record<string, unknown> };

export type TelemetrySummary = {
  session_seconds?: number;
  active_seconds?: number;
  idle_seconds?: number;
  interactions?: number;
  first_interaction_seconds?: number | null;
  overlays?: Array<{ key: string; seconds: number }>;
  overlays_unique?: number;
};

type TelemetryClientOptions = {
  endpoint?: string;
  persistVisitorId?: 'localStorage' | 'cookie';
  shouldIgnore?: () => boolean;
  isMobile?: () => boolean;
  orientation?: () => 'portrait' | 'landscape';
  getPage?: () => string;
  getReferrer?: () => string | undefined;
  idleAfterMs?: number;
};

function clampString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (!value) return undefined;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function safeJsonStringify(value: unknown, maxLen = 5000): string | undefined {
  try {
    const s = JSON.stringify(value);
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  } catch {
    return undefined;
  }
}

const trackingSidKey = 'visit_sid';
const trackingVidKey = 'visit_vid';
const trackingSessionCookieKey = 'visit_scid';
const trackingRefKey = 'visit_ref';
const trackingFingerprintKey = 'visit_fpid';
const trackingVisitSentKey = 'visit_reported';

function readCookie(name: string): string | null {
  try {
    const needle = `${name}=`;
    const parts = document.cookie ? document.cookie.split('; ') : [];
    for (const part of parts) {
      if (part.startsWith(needle)) return decodeURIComponent(part.slice(needle.length));
    }
    return null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
}

function writeSessionCookie(name: string, value: string) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secure}`;
}

function getSessionCookieId(): string {
  const existing = readCookie(trackingSessionCookieKey);
  if (existing) return existing;
  const scid = crypto.randomUUID?.() ?? `scid_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  writeSessionCookie(trackingSessionCookieKey, scid);
  return scid;
}

function getRefTag(persistVisitorId: 'localStorage' | 'cookie'): string | null {
  try {
    const params = new URL(window.location.href).searchParams;
    const incoming = params.get('ref');
    if (incoming) {
      if (persistVisitorId === 'cookie') writeCookie(trackingRefKey, incoming);
      else localStorage.setItem(trackingRefKey, incoming);
      return incoming;
    }
  } catch {
    // ignore
  }
  return persistVisitorId === 'cookie' ? readCookie(trackingRefKey) : localStorage.getItem(trackingRefKey);
}

function getCachedFingerprintId(): string | null {
  try {
    return localStorage.getItem(trackingFingerprintKey);
  } catch {
    return null;
  }
}

let fingerprintPromise: Promise<string | null> | null = null;
function ensureFingerprintId() {
  if (getCachedFingerprintId()) return;
  if (fingerprintPromise) return;
  fingerprintPromise = import('@fingerprintjs/fingerprintjs')
    .then((mod) => mod.default.load())
    .then((fp) => fp.get())
    .then((res) => {
      const id = res?.visitorId ?? null;
      if (id) localStorage.setItem(trackingFingerprintKey, id);
      return id;
    })
    .catch(() => null);
}

function getTrackingIds(persistVisitorId: 'localStorage' | 'cookie'): { vid: string; sid: string } {
  const sid =
    sessionStorage.getItem(trackingSidKey) ??
    (crypto.randomUUID?.() ?? `sid_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`);
  sessionStorage.setItem(trackingSidKey, sid);

  const existingVid =
    persistVisitorId === 'cookie' ? readCookie(trackingVidKey) : localStorage.getItem(trackingVidKey);
  const vid = existingVid ?? (crypto.randomUUID?.() ?? `vid_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`);
  if (persistVisitorId === 'cookie') writeCookie(trackingVidKey, vid);
  else localStorage.setItem(trackingVidKey, vid);

  return { vid, sid };
}

export function createTelemetryClient(options: TelemetryClientOptions = {}) {
  const endpoint = options.endpoint ?? '/api/collect';
  const persistVisitorId = options.persistVisitorId ?? 'localStorage';
  const shouldIgnore = options.shouldIgnore ?? (() => false);
  const isMobile = options.isMobile ?? (() => window.matchMedia('(max-width: 900px)').matches);
  const orientation = options.orientation ?? (() => (window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape'));
  const getPage = options.getPage ?? (() => new URL(window.location.href).pathname + new URL(window.location.href).search);
  const getReferrer = options.getReferrer ?? (() => (document.referrer ? document.referrer : undefined));
  const idleAfterMs = options.idleAfterMs ?? 30_000;

  let seq = 0;
  const queue: TelemetryEvent[] = [];
  let flushTimer: number | null = null;

  const sessionStartMs = performance.now();
  let firstActivityAtMs: number | null = null;
  let lastActivityAtMs: number | null = null;
  let idleStartMs: number | null = null;
  let idleTotalMs = 0;
  let idleCheckTimer: number | null = null;

  const recentClicks: Array<{ at: number; key: string }> = [];

  function nowIso() {
    return new Date().toISOString();
  }

  function noteActivity(kind: string) {
    const now = performance.now();
    if (firstActivityAtMs == null) firstActivityAtMs = now;
    lastActivityAtMs = now;
    if (idleStartMs != null) {
      idleTotalMs += now - idleStartMs;
      idleStartMs = null;
      track('idle_end', { kind });
    }
  }

  function getTimes() {
    const now = performance.now();
    const sessionMs = Math.max(0, now - sessionStartMs);
    const idleMs = idleTotalMs + (idleStartMs != null ? now - idleStartMs : 0);
    const activeMs = Math.max(0, sessionMs - idleMs);
    return { sessionMs, idleMs, activeMs };
  }

  function ensureIdleChecker() {
    if (idleCheckTimer != null) return;
    idleCheckTimer = window.setInterval(() => {
      if (shouldIgnore()) return;
      const now = performance.now();
      if (lastActivityAtMs == null) return;
      if (idleStartMs != null) return;
      if (now - lastActivityAtMs >= idleAfterMs) {
        idleStartMs = now;
        track('idle_start', { after_seconds: Math.round(idleAfterMs / 1000) });
      }
    }, 1000);
  }

  function track(type: string, data: Record<string, unknown> = {}) {
    if (shouldIgnore()) return;

    if (
      type === 'click_target' ||
      type === 'click_link' ||
      type === 'open_overlay' ||
      type === 'close_overlay' ||
      type === 'hover_end' ||
      type === 'mobile_warning_shown' ||
      type === 'rotate_prompt_shown' ||
      type === 'rotate_prompt_dismissed'
    ) {
      noteActivity(type);
    }

    queue.push({ type, ts: nowIso(), seq: seq++, data });

    if (queue.length >= 25) {
      void flush();
      return;
    }
    if (flushTimer == null) {
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        void flush();
      }, 2500);
    }
  }

  function flush(opts: { summary?: TelemetrySummary; useBeacon?: boolean } = {}) {
    if (shouldIgnore()) return Promise.resolve();
    if (!queue.length && !opts.summary) return Promise.resolve();

    const { vid, sid } = getTrackingIds(persistVisitorId);
    const scid = getSessionCookieId();
    const refTag = getRefTag(persistVisitorId);
    const fpid = getCachedFingerprintId();
    const payload = {
      vid,
      sid,
      scid,
      ref_tag: refTag ?? undefined,
      fpid: fpid ?? undefined,
      page: getPage(),
      referrer: getReferrer(),
      is_mobile: isMobile(),
      orientation: orientation(),
      events: queue.splice(0, queue.length),
      summary: opts.summary ?? undefined,
    };

    const body = JSON.stringify(payload);

    if (opts.useBeacon) {
      try {
        if ('sendBeacon' in navigator) {
          navigator.sendBeacon(endpoint, body);
          return Promise.resolve();
        }
      } catch {
        // fall back to fetch
      }
    }

    return fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).then(
      () => undefined,
      () => undefined,
    );
  }

  function ensureVisit(extra: Record<string, unknown> = {}) {
    if (shouldIgnore()) return;
    if (sessionStorage.getItem(trackingVisitSentKey) === '1') return;
    sessionStorage.setItem(trackingVisitSentKey, '1');
    track('visit', extra);
    void flush();
  }

  function buildTimingSummary(base: Omit<TelemetrySummary, 'session_seconds' | 'active_seconds' | 'idle_seconds'>): TelemetrySummary {
    const { sessionMs, idleMs, activeMs } = getTimes();
    const sessionSeconds = Math.round(sessionMs / 1000);
    const idleSeconds = Math.round(idleMs / 1000);
    const activeSeconds = Math.max(0, Math.round(activeMs / 1000));
    return { ...base, session_seconds: sessionSeconds, idle_seconds: idleSeconds, active_seconds: activeSeconds };
  }

  function installGlobalTracking() {
    if (shouldIgnore()) return;

    const onActivity = (kind: string) => () => noteActivity(kind);
    window.addEventListener('pointerdown', onActivity('pointerdown'), { passive: true });
    window.addEventListener('keydown', onActivity('keydown'), { passive: true });
    window.addEventListener('scroll', onActivity('scroll'), { passive: true });
    window.addEventListener('touchstart', onActivity('touchstart'), { passive: true });
    window.addEventListener('focus', () => track('focus'), { passive: true });
    window.addEventListener('blur', () => track('blur'), { passive: true });
    document.addEventListener('visibilitychange', () => track('visibility', { state: document.visibilityState }), { passive: true });

    document.addEventListener(
      'click',
      (e) => {
        try {
          const target = e.target as Element | null;
          if (!target) return;
          const tracked = target.closest?.('[data-track]') as HTMLElement | null;
          if (tracked) {
            const label = clampString(tracked.getAttribute('data-track'), 120);
            if (label) {
              const group = clampString(tracked.getAttribute('data-track-group'), 80);
              track('click_target', { target: label, group: group ?? undefined });
            }
          }
          const a = target.closest?.('a') as HTMLAnchorElement | null;
          if (!a) return;
          const href = clampString(a.href, 800);
          if (!href) return;
          const u = new URL(href);
          track('click_link', { host: u.host, path: clampString(u.pathname + u.search, 500) ?? u.pathname });
        } catch {
          // ignore
        }
      },
      { capture: true, passive: true },
    );

    window.addEventListener(
      'error',
      (e: ErrorEvent) => {
        track('js_error', {
          message: clampString(e.message, 300),
          filename: clampString(e.filename, 400),
          lineno: e.lineno ?? null,
          colno: e.colno ?? null,
        });
      },
      { passive: true },
    );

    window.addEventListener(
      'unhandledrejection',
      (e: PromiseRejectionEvent) => {
        const reason = clampString(safeJsonStringify(e.reason) ?? String(e.reason), 600);
        track('unhandledrejection', { reason });
      },
      { passive: true },
    );

    // Quick signal for rage-clicking (frustration / bot / broken UX)
    window.addEventListener(
      'click',
      (e) => {
        try {
          const t = e.target as Element | null;
          if (!t) return;
          const key = clampString((t as HTMLElement).id || (t as HTMLElement).className || t.tagName, 80) ?? t.tagName;
          const now = performance.now();
          recentClicks.push({ at: now, key });
          while (recentClicks.length && now - recentClicks[0].at > 2000) recentClicks.shift();
          const same = recentClicks.filter((c) => c.key === key);
          if (same.length >= 5) {
            track('rage_click', { key, clicks_2s: same.length });
            recentClicks.length = 0;
          }
        } catch {
          // ignore
        }
      },
      { passive: true },
    );

    // Navigation timing snapshot (helps identify slow loads / bots)
    window.addEventListener(
      'load',
      () => {
        try {
          const nav = performance.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
          if (!nav) return;
          track('perf_nav', {
            redirect_ms: Math.round(nav.redirectEnd - nav.redirectStart),
            dns_ms: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
            tcp_ms: Math.round(nav.connectEnd - nav.connectStart),
            ttfb_ms: Math.round(nav.responseStart - nav.requestStart),
            response_ms: Math.round(nav.responseEnd - nav.responseStart),
            dom_interactive_ms: Math.round(nav.domInteractive - nav.startTime),
            dcl_ms: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
            load_ms: Math.round(nav.loadEventEnd - nav.startTime),
          });
        } catch {
          // ignore
        }
      },
      { once: true, passive: true },
    );

    ensureIdleChecker();
    ensureFingerprintId();
    if (fingerprintPromise) {
      fingerprintPromise.then((id) => {
        if (!id) return;
        track('fingerprint_ready', { fingerprint_id: id });
        void flush();
      });
    }
  }

  return {
    track,
    flush,
    ensureVisit,
    buildTimingSummary,
    installGlobalTracking,
  };
}

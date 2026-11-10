import { useCallback, useEffect, useState } from 'preact/hooks';

const BASE = location.pathname;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(route: string, params: Record<string, string | number | boolean | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams({ api: route });
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== false) qs.set(k, v === true ? '1' : String(v));
  const res = await fetch(`${BASE}?${qs}`, { headers: { accept: 'application/json' }, credentials: 'same-origin' });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) throw new ApiError(res.status, body.message ?? body.error ?? `HTTP ${res.status}`);
  return body as T;
}

export async function post<T = unknown>(route: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}?api=${encodeURIComponent(route)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  return data as T;
}

export type Load<T> = { data: T | null; error: Error | null; loading: boolean; reload: () => void };

export function useApi<T>(route: string | null, params: Record<string, string | number | boolean | undefined> = {}): Load<T> {
  const key = route ? `${route}?${JSON.stringify(params)}` : '';
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!route) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(route, params).then(
      (data) => live && setState({ data, error: null, loading: false }),
      (error: Error) => live && setState({ data: null, error, loading: false }),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

// ---- formatting ------------------------------------------------------------

export function duration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - Date.parse(iso);
  const s = Math.round(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  return date(iso);
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${date(iso)}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

export type Place = { city: string | null; region: string | null; country: string | null } | null;
export function place(p: Place): string {
  if (!p) return '';
  return [p.city, p.region, p.country].filter(Boolean).join(', ');
}

export type Device = { browser: string | null; os: string | null; type: string | null } | null;
export function device(d: Device): string {
  if (!d) return '';
  const what = [d.browser, d.os && `on ${d.os}`].filter(Boolean).join(' ');
  return what || (d.type ?? '');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---- routing -----------------------------------------------------------------

export function useRoute(): string[] {
  const read = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const href = (...parts: string[]) => `#/${parts.map(encodeURIComponent).join('/')}`;

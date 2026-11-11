/** Context the hosting adapter can pass alongside the Web `Request`. */
export type RequestContext = {
  /** Client IP as determined by the host (the Node adapter sets this; Vercel uses headers). */
  ip?: string;
};

export type Handler = (req: Request, ctx?: RequestContext) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function clientIp(req: Request, ctx?: RequestContext): string | null {
  if (ctx?.ip) return normalizeIp(ctx.ip);
  // On Vercel, x-real-ip and x-forwarded-for are set by the platform and cannot be spoofed by the client.
  const real = req.headers.get('x-real-ip');
  if (real) return normalizeIp(real);
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return normalizeIp(fwd.split(',')[0] ?? '');
  return null;
}

export function normalizeIp(raw: string): string | null {
  let ip = raw.trim();
  if (!ip) return null;
  if (ip.startsWith('::ffff:') && ip.includes('.')) ip = ip.slice(7);
  if (ip.length > 64) return null;
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  return ip.toLowerCase();
}

export function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Read the body as text, refusing anything larger than `maxBytes`. */
export async function readBody(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, 'Payload too large');
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new HttpError(413, 'Payload too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const raw = await readBody(req, maxBytes);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

/** Admin commands accept JSON objects, never null, arrays or primitives. */
export async function readJsonObject(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const body = await readJson(req, maxBytes);
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'body must be an object');
  }
  return body as Record<string, unknown>;
}

const BASE_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  headers.set('content-type', 'application/json; charset=utf-8');
  if (!headers.has('cache-control')) headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function text(body: string, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { ...BASE_HEADERS, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

export function empty(status = 204, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...BASE_HEADERS, ...extra } });
}

let lastLogged = new Map<string, number>();
/** Log an error at most once a minute per key, without request bodies or secrets. */
export function logError(key: string, err: unknown): void {
  const now = Date.now();
  if ((lastLogged.get(key) ?? 0) > now - 60_000) return;
  if (lastLogged.size > 200) lastLogged = new Map();
  lastLogged.set(key, now);
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[dossier] ${key}: ${message}`);
}

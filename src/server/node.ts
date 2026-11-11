import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { Handler } from './http.js';

export type NodeListenerOptions = {
  /** Trust X-Forwarded-For / X-Real-IP (only when running behind your own reverse proxy). */
  trustProxy?: boolean;
};

/** Adapt a Web `Request -> Response` handler to Node's `http` server. */
export function toNodeListener(handler: Handler, opts: NodeListenerOptions = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const proto = (opts.trustProxy && String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]) || 'http';
      const url = new URL(req.url ?? '/', `${proto}://${req.headers.host ?? 'localhost'}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value == null) continue;
        if (Array.isArray(value)) for (const v of value) headers.append(key, v);
        else headers.set(key, value);
      }
      const method = req.method ?? 'GET';
      const hasBody = method !== 'GET' && method !== 'HEAD';
      const request = new Request(url, {
        method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>) : undefined,
        ...(hasBody ? { duplex: 'half' } : {}),
      } as RequestInit);

      const ip = opts.trustProxy ? undefined : req.socket.remoteAddress;
      const response = await handler(request, ip ? { ip } : {});

      res.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key === 'set-cookie') return;
        res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      if (!response.body || method === 'HEAD') {
        res.end();
        return;
      }
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (err) {
      console.error('[dossier] request failed:', err instanceof Error ? err.message : err);
      if (!res.headersSent) res.statusCode = 500;
      res.end();
    }
  };
}

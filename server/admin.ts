import { getHeader } from './http.js';

export function getAuthToken(req: any): string | null {
  const auth = getHeader(req, 'authorization');
  if (auth && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerToken = getHeader(req, 'x-admin-token');
  if (headerToken) return headerToken;
  return null;
}

export function requireAdmin(req: any, res: any): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    res.statusCode = 503;
    res.end('ADMIN_TOKEN not configured');
    return false;
  }

  const actual = getAuthToken(req);
  if (!actual || actual !== expected) {
    res.statusCode = 401;
    res.end('Unauthorized');
    return false;
  }

  return true;
}

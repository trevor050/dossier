import { describe, expect, it } from 'vitest';
import { checkOrigin } from '../src/server/collect.js';
import { RateLimiter, safeEqual, signSession, SESSION_TTL_SECONDS, verifySession } from '../src/server/security.js';

const TOKEN = 'correct-horse-battery-staple';

describe('admin session cookie', () => {
  it('round-trips and contains no secret material', () => {
    const value = signSession(TOKEN, 0);
    expect(value).not.toContain(TOKEN);
    expect(verifySession(TOKEN, value, 1000)).toBe(true);
  });

  it('expires', () => {
    const value = signSession(TOKEN, 0);
    expect(verifySession(TOKEN, value, SESSION_TTL_SECONDS * 1000 + 1)).toBe(false);
  });

  it('rejects tampering and is invalidated by rotating the token', () => {
    const value = signSession(TOKEN, 0);
    const [exp, mac] = value.split('.');
    expect(verifySession(TOKEN, `${Number(exp) + 999999}.${mac}`, 0)).toBe(false);
    expect(verifySession('a-different-admin-token', value, 0)).toBe(false);
    expect(verifySession(TOKEN, 'garbage', 0)).toBe(false);
    expect(verifySession(TOKEN, null, 0)).toBe(false);
  });
});

describe('safeEqual', () => {
  it('compares by value regardless of length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('allows `limit` hits per window per key', () => {
    const rl = new RateLimiter(2, 1000);
    expect([rl.take('a', 0), rl.take('a', 1), rl.take('a', 2), rl.take('b', 2)]).toEqual([true, true, false, true]);
    expect(rl.take('a', 1001)).toBe(true);
  });
});

describe('checkOrigin', () => {
  const req = (headers: Record<string, string>) => new Request('https://me.example/api/collect', { method: 'POST', headers });
  const config = { allowedHosts: ['partner.example'], allowLocalhost: false };

  it('allows same-origin without CORS headers', () => {
    expect(checkOrigin(req({ host: 'me.example', origin: 'https://me.example' }), config)).toEqual({ allowed: true, corsOrigin: null });
  });

  it('echoes allow-listed cross-origin callers', () => {
    expect(checkOrigin(req({ host: 'me.example', origin: 'https://partner.example' }), config)).toEqual({
      allowed: true,
      corsOrigin: 'https://partner.example',
    });
  });

  it('refuses unknown origins and localhost in production', () => {
    expect(checkOrigin(req({ host: 'me.example', origin: 'https://evil.example' }), config).allowed).toBe(false);
    expect(checkOrigin(req({ host: 'me.example', origin: 'http://localhost:5173' }), config).allowed).toBe(false);
    expect(checkOrigin(req({ host: 'me.example', origin: 'http://localhost:5173' }), { ...config, allowLocalhost: true }).allowed).toBe(true);
  });

  it('falls back to Sec-Fetch-Site when there is no Origin or Referer', () => {
    expect(checkOrigin(req({ host: 'me.example', 'sec-fetch-site': 'same-origin' }), config).allowed).toBe(true);
    expect(checkOrigin(req({ host: 'me.example' }), config).allowed).toBe(false);
  });
});

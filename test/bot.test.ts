import { describe, expect, it } from 'vitest';
import { computeBotScore } from '../src/server/bot.js';
import { parseUserAgent } from '../src/server/ua.js';

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const human = { userAgent: chrome, acceptLanguage: 'en-US,en;q=0.9' };

describe('computeBotScore', () => {
  it('passes an ordinary browser', () => {
    expect(computeBotScore(human)).toEqual({ score: 0, reasons: [], isBot: false });
  });

  it.each([
    ['HeadlessChrome', chrome.replace('Chrome/', 'HeadlessChrome/'), 'headless browser'],
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'search/AI crawler'],
    ['Slack unfurler', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)', 'link preview'],
    ['LinkedIn preview', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)', 'link preview'],
    ['curl', 'curl/8.7.1', 'http client'],
    ['python', 'python-requests/2.32.3', 'http client'],
  ])('flags %s', (_name, userAgent, reason) => {
    const verdict = computeBotScore({ ...human, userAgent });
    expect(verdict.isBot).toBe(true);
    expect(verdict.reasons).toContain(reason);
  });

  it('treats navigator.webdriver as decisive even with a normal UA', () => {
    expect(computeBotScore({ ...human, webdriver: true }).isBot).toBe(true);
  });

  it('flags request velocity', () => {
    expect(computeBotScore({ ...human, highVelocity: true }).reasons).toContain('request velocity');
  });

  it('weak signals alone do not make a bot', () => {
    const v = computeBotScore({ userAgent: chrome, acceptLanguage: '', activeSeconds: 0, interactions: 0, org: 'AS16509 Amazon.com, Inc.' });
    expect(v.reasons).toEqual(['no accept-language', 'datacenter network', 'no interaction']);
    expect(v.score).toBe(6);
    expect(v.isBot).toBe(true);
    expect(computeBotScore({ userAgent: chrome, acceptLanguage: '', org: 'AS16509 Amazon.com, Inc.' }).isBot).toBe(false);
  });

  it('respects a custom threshold', () => {
    expect(computeBotScore({ ...human, userAgent: 'some-crawler/1.0' }, 4).isBot).toBe(true);
    expect(computeBotScore({ ...human, userAgent: 'some-crawler/1.0' }, 10).isBot).toBe(false);
  });

  it('notices sessions that were left idle', () => {
    expect(computeBotScore({ ...human, idleSeconds: 99, sessionSeconds: 100 }).reasons).toContain('mostly idle');
  });
});

describe('parseUserAgent', () => {
  it.each([
    [chrome, 'Chrome', 'macOS', 'desktop'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Safari', 'iOS', 'mobile'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0', 'Edge', 'Windows', 'desktop'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36', 'Chrome', 'Android', 'mobile'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', 'Safari', 'iPadOS', 'tablet'],
  ])('%s', (ua, browser, os, type) => {
    expect(parseUserAgent(ua)).toEqual({ browser, os, type });
  });
});

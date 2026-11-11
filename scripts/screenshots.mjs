// Captures the README screenshots from a running demo (`npm run demo` in another terminal).
// Usage: node scripts/screenshots.mjs [outDir]   (BASE=http://localhost:8787 by default)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const base = process.env.BASE ?? 'http://localhost:8787';
const out = process.argv[2] ?? 'docs/screenshots';
mkdirSync(out, { recursive: true });

const shots = [
  { name: 'people', path: '/api/admin#/', full: true },
  { name: 'person', path: '/api/admin#/l/k7m2xq4', full: true },
  { name: 'session', path: '/api/admin#/s/demo-session-001', wait: '.rr-player', full: false },
  { name: 'map', path: '/api/admin#/map', full: false },
  { name: 'phone-people', path: '/api/admin#/', phone: true, full: false },
  { name: 'phone-person', path: '/api/admin#/l/k7m2xq4', phone: true, full: false },
];

const browser = await chromium.launch();
const errors = [];
for (const shot of shots) {
  for (const scheme of shot.schemes ?? ['light']) {
    const context = await browser.newContext({
      viewport: shot.phone ? { width: 390, height: 844 } : { width: 1360, height: 900 },
      deviceScaleFactor: 2,
      colorScheme: scheme,
      isMobile: Boolean(shot.phone),
      hasTouch: Boolean(shot.phone),
    });
    const page = await context.newPage();
    page.on('console', (m) => m.type() === 'error' && errors.push(`${shot.name}: ${m.text()}`));
    page.on('pageerror', (e) => errors.push(`${shot.name}: ${e.message}`));
    await page.goto(base + shot.path, { waitUntil: 'networkidle' });
    if (shot.wait) await page.waitForSelector(shot.wait, { timeout: 10_000 }).catch(() => errors.push(`${shot.name}: ${shot.wait} not found`));
    await page.waitForTimeout(400);
    const file = `${out}/${shot.name}${scheme === 'dark' ? '-dark' : ''}.png`;
    await page.screenshot({ path: file, fullPage: shot.full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) errors.push(`${shot.name}: horizontal overflow`);
    console.log(`saved ${file}`);
    await context.close();
  }
}
await browser.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
}

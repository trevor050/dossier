// End-to-end check against a running server that serves the sample site
// (`dossier demo`, or `dossier serve --sample`). Drives a real Chromium through the
// tracker, then reads the result back through the admin API.
// Usage: BASE=http://localhost:8787 [TOKEN=...] node scripts/e2e.mjs
import { chromium } from 'playwright-core';

const base = process.env.BASE ?? 'http://localhost:8787';
const tag = `e2e-${Date.now().toString(36)}`;
const headers = process.env.TOKEN ? { authorization: `Bearer ${process.env.TOKEN}` } : {};
const fail = (msg) => {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
};

// Look like a normal browser. The UA has to be set at launch: headless Chromium sends
// beacons with its own "HeadlessChrome" UA regardless of context overrides, and the
// collector (correctly) treats that as a bot. The bot check below uses a plain launch.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
// WSLg display handles can leave headless Chromium with no animation frames or
// visibility callbacks. Headless Linux runs do not need a desktop display.
const headlessOptions = process.platform === 'linux'
  ? { env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' } }
  : {};
const browser = await chromium.launch({ ...headlessOptions, args: [`--user-agent=${UA}`, '--lang=en-US'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', userAgent: UA });
await context.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));
// Reproduce delayed visibility delivery without replacing real observer entries.
if (Number(process.env.E2E_OBSERVER_DELAY_MS) > 0) await context.addInitScript((delay) => {
  const Original = window.IntersectionObserver;
  window.IntersectionObserver = class extends Original {
    constructor(callback, options) {
      super((entries, observer) => setTimeout(() => callback(entries, observer), delay), options);
    }
  };
}, Number(process.env.E2E_OBSERVER_DELAY_MS));
const page = await context.newPage();
const posts = [];
let lastSummary;
page.on('request', (r) => {
  if (r.method() !== 'POST' || !r.url().includes('/api/collect')) return;
  posts.push(r.url());
  if (!r.url().includes('kind=replay')) {
    const body = r.postDataJSON();
    if (body?.summary) lastSummary = body.summary;
  }
});

// A fixed sleep can finish before IntersectionObserver delivers the new section.
// Wait for the real tracker to report dwell before navigating away from it.
async function waitForDwell(key, seconds = 2) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await page.mouse.move(250, 260);
    await page.evaluate(() => window.dossier?.flush());
    if (lastSummary?.sections?.some((d) => d.key === key && d.seconds >= seconds)) return;
    await page.waitForTimeout(500);
  }
  const state = await page.evaluate(() => ({ visibility: document.visibilityState, scroll: scrollY }));
  await browser.close();
  throw new Error(`Timed out waiting for ${key} dwell: ${JSON.stringify({ state, lastSummary })}`);
}

await page.goto(`${base}/?to=${tag}&keep=1#top`, { waitUntil: 'networkidle' });
const url = page.url();
if (url.includes('to=')) fail(`link tag still in the address bar: ${url}`);
if (!url.includes('keep=1') || !url.endsWith('#top')) fail(`other params/hash were not preserved: ${url}`);

await page.mouse.move(300, 300);
await page.waitForTimeout(2500);
await page.evaluate(() => document.getElementById('projects').scrollIntoView());
await page.mouse.move(400, 320);
await waitForDwell('projects');
await page.click('[data-track="project-orbit"]');
await page.evaluate(() => document.getElementById('experience').scrollIntoView());
await page.click('[data-track="open-resume"]');
await waitForDwell('resume');
await page.click('dialog button');
await page.fill('input', 'secret@example.com');
await page.waitForTimeout(6000); // let the replay flush timer fire

// A second page load in the same visit (full navigation, same session). Its summary must add to the
// first page's, not replace it. The first page's summary goes out in its pagehide beacon.
await page.goto(`${base}/?part=2`, { waitUntil: 'networkidle' });
await page.mouse.move(200, 200);
await page.evaluate(() => document.getElementById('about').scrollIntoView());
await page.mouse.move(250, 260);
await waitForDwell('about');
await page.mouse.move(260, 280);
await page.waitForTimeout(2000);
await page.goto('about:blank'); // pagehide -> summary beacon for page 2
await page.waitForTimeout(1500);
await browser.close();

// A plain headless visit should be filtered as a bot.
const botTag = `${tag}-bot`;
const botBrowser = await chromium.launch(headlessOptions);
const botPage = await (await botBrowser.newContext()).newPage();
await botPage.goto(`${base}/?to=${botTag}`, { waitUntil: 'networkidle' });
await botPage.waitForTimeout(1000);
await botPage.goto('about:blank');
await botPage.waitForTimeout(1000);
await botBrowser.close();

console.log(`collector POSTs: ${posts.length} (${posts.filter((u) => u.includes('kind=replay')).length} replay)`);

const get = async (route, params = {}) => {
  const qs = new URLSearchParams({ api: route, ...params });
  const res = await fetch(`${base}/api/admin?${qs}`, { headers });
  if (!res.ok) throw new Error(`${route}: HTTP ${res.status}`);
  return res.json();
};
const overview = await get('overview', { days: 1 });
const person = overview.people.find((p) => p.tags.includes(tag));
if (!person) {
  fail(`no person with tag ${tag} in overview`);
} else {
  const detail = await get('person', { id: person.id });
  const s = detail.sessions[0];
  console.log(`person: ${person.name} · ${person.visits} visit · ${person.active_seconds}s active`);
  console.log(`sections: ${detail.attention.map((d) => `${d.key}=${d.seconds}s`).join(', ')}`);
  console.log(`clicks: ${detail.clicks.map((c) => `${c.label}×${c.count}`).join(', ')}`);
  console.log(`pages: ${s.pages.join(' -> ')} · visit active ${s.active_seconds}s`);
  if (detail.sessions.length !== 1) fail(`expected one visit across both page loads, got ${detail.sessions.length}`);
  if (!(s.pages.includes('/?keep=1') && s.pages.includes('/?part=2'))) fail(`page list lost a page: ${JSON.stringify(s.pages)}`);
  if (!detail.attention.some((d) => d.key === 'about')) fail('second page sections missing');
  if (detail.clicks.some((c) => c.count > 1)) fail('a single click was counted more than once');
  if (person.active_seconds < 5) fail('active time not recorded');
  for (const key of ['projects', 'resume']) if (!detail.attention.some((d) => d.key === key)) fail(`no dwell for ${key}`);
  if (!detail.clicks.some((c) => c.label === 'project-orbit')) fail('click not recorded');
  const session = await get('session', { sid: s.sid });
  console.log(`events: ${session.events.map((e) => e.type).join(', ')}`);
  console.log(`replay: ${session.replay.chunks} chunks, ${session.replay.bytes} bytes`);
  if (process.env.EXPECT_REPLAY !== '0' && session.replay.chunks === 0) fail('no replay recorded');
  if (session.replay.chunks) {
    const replay = await get('replay', { sid: s.sid });
    const raw = JSON.stringify(replay.events);
    if (raw.includes('secret@example.com')) fail('input value leaked into replay (masking failed)');
    else console.log('replay input masking: ok');
  }
}
const bots = await get('bots', { days: 1 });
const botVisit = bots.sessions.find((b) => (b.user_agent ?? '').includes('HeadlessChrome'));
if (!botVisit) fail('headless visit was not classified as a bot');
else console.log(`bot filtered: ${botVisit.reasons}`);
const humans = await get('overview', { days: 1 });
if (humans.people.some((p) => p.tags.includes(botTag))) fail('bot visit leaked into People');

// A normal recipient URL must not push Copy off the screen on a phone.
const layoutLabel = `E2E recipient ${tag}`;
const linkResponse = await fetch(`${base}/api/admin?api=links`, {
  method: 'POST',
  headers: { ...headers, origin: base, 'content-type': 'application/json' },
  body: JSON.stringify({ label: layoutLabel }),
});
if (!linkResponse.ok) throw new Error(`create layout link: HTTP ${linkResponse.status}`);
const { link: layoutLink } = await linkResponse.json();
const layoutBrowser = await chromium.launch(headlessOptions);
try {
  const layoutPage = await (await layoutBrowser.newContext({ extraHTTPHeaders: headers, viewport: { width: 390, height: 844 } })).newPage();
  await layoutPage.goto(`${base}/api/admin#/l/${layoutLink.id}`);
  await layoutPage.getByRole('heading', { name: layoutLabel, exact: true }).waitFor();
  const layout = await layoutPage.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    buttonsFit: [...document.querySelectorAll('.url button')].every((b) => b.getBoundingClientRect().right <= innerWidth),
  }));
  if (layout.scrollWidth > layout.width || !layout.buttonsFit) fail(`phone link layout overflows: ${JSON.stringify(layout)}`);
  else console.log('phone named-link layout: ok');
} finally {
  await layoutBrowser.close();
}

console.log(process.exitCode ? 'E2E FAILED' : 'E2E OK');

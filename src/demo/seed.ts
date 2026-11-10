import type { Db } from '../server/db.js';
import { buildIdentityEdges } from '../server/identity.js';
import { makeDisplayName } from '../server/names.js';
import { parseUserAgent } from '../server/ua.js';

/**
 * Deterministic fake data for demo mode. Every person, link and network below is
 * invented; locations are real cities so the map has something to show.
 */

const UA = {
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  winEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  headless:
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36',
  curl: 'curl/8.7.1',
};

const PLACES = {
  hamilton: { city: 'Hamilton', region: 'New York', country: 'US', lat: 42.827, lon: -75.545 },
  sf: { city: 'San Francisco', region: 'California', country: 'US', lat: 37.775, lon: -122.419 },
  seattle: { city: 'Seattle', region: 'Washington', country: 'US', lat: 47.606, lon: -122.332 },
  austin: { city: 'Austin', region: 'Texas', country: 'US', lat: 30.267, lon: -97.743 },
  london: { city: 'London', region: 'England', country: 'GB', lat: 51.507, lon: -0.128 },
  toronto: { city: 'Toronto', region: 'Ontario', country: 'CA', lat: 43.653, lon: -79.383 },
  berlin: { city: 'Berlin', region: 'Berlin', country: 'DE', lat: 52.52, lon: 13.405 },
  nj: { city: 'Princeton', region: 'New Jersey', country: 'US', lat: 40.357, lon: -74.667 },
  ashburn: { city: 'Ashburn', region: 'Virginia', country: 'US', lat: 39.044, lon: -77.487 },
  denver: { city: 'Denver', region: 'Colorado', country: 'US', lat: 39.739, lon: -104.99 },
};
type PlaceKey = keyof typeof PLACES;

type Visit = {
  hoursAgo: number;
  active: number; // seconds
  sections: Array<[string, number]>;
  clicks?: string[];
  scroll?: number;
  replay?: boolean;
  referrer?: string;
};

type Persona = {
  vid: string;
  link?: string;
  tag?: string;
  label?: string;
  ua: string;
  place: PlaceKey;
  org: string;
  ptr?: string;
  ip: string;
  fpid?: string;
  bot?: { score: number; reasons: string };
  visits: Visit[];
};

const LINKS = [
  { id: 'k7m2xq4', slug: 'admissions-office', label: 'Admissions office', daysAgo: 9, note: 'Sent with the application supplement' },
  { id: 'p3w9hd2', slug: 'northwind-recruiter', label: 'Recruiter, Northwind', daysAgo: 6, note: null },
  { id: 'e8t4nv6', slug: 'fabrikam-design-lead', label: 'Design lead, Fabrikam', daysAgo: 4, note: null },
  { id: 'r5c2bj9', slug: 'grandma', label: 'Grandma', daysAgo: 3, note: null },
  { id: 'h6y3fz8', slug: 'hackathon-judges', label: 'Hackathon judges', daysAgo: 1, note: 'Not opened yet, as of the demo' },
];

const PERSONAS: Persona[] = [
  {
    vid: 'demo-admissions-1',
    link: 'k7m2xq4',
    ua: UA.macSafari,
    place: 'hamilton',
    org: 'AS0000 Example University Network',
    ptr: 'wifi-guest-118.campus.example.edu',
    ip: '203.0.113.18',
    visits: [
      { hoursAgo: 196, active: 312, sections: [['intro', 22], ['projects', 141], ['experience', 63], ['resume', 58], ['about', 28]], clicks: ['project-pixel', 'open-resume'], scroll: 100, replay: true },
      { hoursAgo: 52, active: 148, sections: [['projects', 96], ['resume', 40], ['intro', 12]], clicks: ['project-orbit'], scroll: 64 },
      { hoursAgo: 3, active: 71, sections: [['resume', 44], ['contact', 19], ['intro', 8]], clicks: ['open-resume', 'email'], scroll: 100 },
    ],
  },
  {
    vid: 'demo-northwind-1',
    link: 'p3w9hd2',
    ua: UA.winEdge,
    place: 'seattle',
    org: 'AS0000 Northwind Traders (example)',
    ip: '198.51.100.40',
    visits: [{ hoursAgo: 130, active: 47, sections: [['intro', 18], ['projects', 29]], clicks: ['github'], scroll: 41 }],
  },
  {
    vid: 'demo-fabrikam-1',
    link: 'e8t4nv6',
    ua: UA.iphone,
    place: 'london',
    org: 'AS0000 Example Mobile UK',
    ip: '198.51.100.77',
    visits: [
      { hoursAgo: 90, active: 96, sections: [['projects', 70], ['intro', 26]], scroll: 58, referrer: 'https://www.linkedin.com/' },
      { hoursAgo: 20, active: 204, sections: [['projects', 120], ['experience', 51], ['about', 33]], clicks: ['project-ledger'], scroll: 88, replay: true },
    ],
  },
  {
    vid: 'demo-grandma-1',
    link: 'r5c2bj9',
    ua: UA.android,
    place: 'denver',
    org: 'AS0000 Example Cable',
    ip: '192.0.2.61',
    visits: [{ hoursAgo: 70, active: 512, sections: [['about', 240], ['intro', 160], ['projects', 112]], scroll: 100 }],
  },
  {
    vid: 'demo-anon-1',
    tag: 'twitter',
    ua: UA.macChrome,
    place: 'sf',
    org: 'AS0000 Example Fiber',
    ip: '203.0.113.90',
    fpid: 'demofp7c2a9e',
    visits: [{ hoursAgo: 28, active: 38, sections: [['intro', 20], ['projects', 18]], referrer: 'https://t.co/', scroll: 33 }],
  },
  {
    vid: 'demo-anon-1b',
    ua: UA.macChrome,
    place: 'sf',
    org: 'AS0000 Example Fiber',
    ip: '203.0.113.91',
    fpid: 'demofp7c2a9e',
    visits: [{ hoursAgo: 6, active: 133, sections: [['projects', 101], ['experience', 32]], clicks: ['project-orbit', 'github'], scroll: 76 }],
  },
  {
    vid: 'demo-anon-2',
    ua: UA.winFirefox,
    place: 'berlin',
    org: 'AS0000 Example Telekom',
    ip: '192.0.2.150',
    visits: [{ hoursAgo: 44, active: 12, sections: [['intro', 12]], scroll: 12, referrer: 'https://news.ycombinator.com/' }],
  },
  {
    vid: 'demo-anon-3',
    ua: UA.macSafari,
    place: 'toronto',
    org: 'AS0000 Example Communications',
    ip: '198.51.100.200',
    visits: [
      { hoursAgo: 240, active: 66, sections: [['projects', 40], ['intro', 26]], scroll: 45 },
      { hoursAgo: 11, active: 90, sections: [['projects', 51], ['contact', 39]], clicks: ['email'], scroll: 100 },
    ],
  },
  {
    vid: 'demo-anon-4',
    ua: UA.iphone,
    place: 'austin',
    org: 'AS0000 Example Wireless',
    ip: '203.0.113.140',
    visits: [{ hoursAgo: 1, active: 24, sections: [['intro', 15], ['projects', 9]], scroll: 30 }],
  },
  {
    vid: 'demo-anon-5',
    ua: UA.macChrome,
    place: 'nj',
    org: 'AS0000 Example Broadband',
    ip: '192.0.2.33',
    visits: [{ hoursAgo: 150, active: 58, sections: [['experience', 31], ['projects', 27]], scroll: 70, referrer: 'https://www.google.com/' }],
  },
  {
    vid: 'demo-bot-1',
    ua: UA.headless,
    place: 'ashburn',
    org: 'AS16509 Amazon.com, Inc.',
    ptr: 'ec2-203-0-113-7.compute-1.amazonaws.com',
    ip: '203.0.113.7',
    bot: { score: 9, reasons: 'headless browser, datacenter network' },
    visits: [{ hoursAgo: 15, active: 0, sections: [] }, { hoursAgo: 39, active: 0, sections: [] }],
  },
  {
    vid: 'demo-bot-2',
    ua: UA.curl,
    place: 'ashburn',
    org: 'AS14061 DigitalOcean, LLC',
    ip: '198.51.100.9',
    bot: { score: 8, reasons: 'http client, no accept-language, datacenter network' },
    visits: [{ hoursAgo: 60, active: 0, sections: [] }],
  },
];

/** A tiny but valid rrweb recording of the sample site, so the replay player has something to show. */
function syntheticReplay(startMs: number, sections: Array<[string, number]>): unknown[] {
  let id = 1;
  const text = (t: string) => ({ type: 3, textContent: t, id: id++ });
  const el = (tagName: string, attributes: Record<string, string>, childNodes: unknown[]) => ({
    type: 2,
    tagName,
    attributes,
    childNodes,
    id: id++,
  });
  const style = `body{margin:0;font:17px/1.6 system-ui,sans-serif;color:#1d1b18;background:#fbfaf7}header,section{max-width:760px;margin:0 auto;padding:64px 24px;min-height:520px;border-top:1px solid #e4dfd5}h1{font-size:44px;margin:0}.card{border:1px solid #e4dfd5;border-radius:8px;padding:16px;margin:12px 0;background:#fff}`;
  const doc = {
    type: 0,
    id: id++,
    childNodes: [
      { type: 1, name: 'html', publicId: '', systemId: '', id: id++ },
      el('html', { lang: 'en' }, [
        el('head', {}, [el('style', {}, [text(style)])]),
        el('body', {}, [
          el('header', {}, [el('h1', {}, [text('Sam Rivera')]), el('p', {}, [text('Builds small, useful things.')])]),
          el('section', { id: 'projects' }, [
            el('h2', {}, [text('Projects')]),
            el('div', { class: 'card' }, [text('Orbit — a satellite pass predictor.')]),
            el('div', { class: 'card' }, [text('Ledger — splits grocery bills from a receipt photo.')]),
            el('div', { class: 'card' }, [text('Pixel Room — an interactive résumé.')]),
          ]),
          el('section', { id: 'experience' }, [el('h2', {}, [text('Experience')]), el('p', {}, [text('Teaching assistant. Mapping intern.')])]),
          el('section', { id: 'about' }, [el('h2', {}, [text('About')]), el('p', {}, [text('Trail running, old maps.')])]),
          el('section', { id: 'contact' }, [el('h2', {}, [text('Contact')]), el('p', {}, [text('sam@example.com')])]),
        ]),
      ]),
    ],
  };
  const events: unknown[] = [
    { type: 4, data: { href: 'https://sam.example/', width: 1280, height: 800 }, timestamp: startMs },
    { type: 2, data: { node: doc, initialOffset: { left: 0, top: 0 } }, timestamp: startMs + 10 },
  ];
  // Scroll through the sections roughly in proportion to the time spent on each.
  const offsets: Record<string, number> = { intro: 0, projects: 600, experience: 1120, resume: 1120, about: 1640, contact: 2160 };
  let t = startMs + 500;
  for (const [key, seconds] of sections) {
    const target = offsets[key] ?? 0;
    for (let i = 0; i < 6; i++) {
      t += 180;
      events.push({ type: 3, data: { source: 3, id: 1, x: 0, y: Math.round(target * ((i + 1) / 6)) }, timestamp: t });
    }
    const dwellMs = Math.min(seconds, 8) * 1000;
    for (let i = 0; i < 10; i++) {
      t += dwellMs / 10;
      events.push({
        type: 3,
        data: { source: 1, positions: [{ x: 300 + Math.round(Math.sin(i) * 140), y: 260 + i * 18, id: 9, timeOffset: 0 }] },
        timestamp: Math.round(t),
      });
    }
  }
  return events;
}

export async function seedDemo(db: Db): Promise<void> {
  const now = Date.now();
  const hours = (h: number) => new Date(now - h * 3_600_000);

  for (const l of LINKS) {
    await db.query(`INSERT INTO links (id, slug, label, path, note, created_at) VALUES ($1, $2, $3, '/', $4, $5)`, [
      l.id,
      l.slug,
      l.label,
      l.note,
      hours(l.daysAgo * 24 + 2),
    ]);
  }

  let n = 0;
  for (const p of PERSONAS) {
    const place = PLACES[p.place];
    const first = hours(Math.max(...p.visits.map((v) => v.hoursAgo)));
    const last = hours(Math.min(...p.visits.map((v) => v.hoursAgo)));
    await db.query(
      `INSERT INTO visitors (vid, display_name, label, first_seen_at, last_seen_at, first_ip, last_ip, first_user_agent, last_user_agent,
                             first_ref_tag, last_ref_tag, ptr, bot_override)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $7, $7, $8, $8, $9, NULL)`,
      [p.vid, makeDisplayName(p.vid), p.label ?? null, first, last, p.ip, p.ua, p.tag ?? p.link ?? null, p.ptr ?? null],
    );

    for (const v of p.visits) {
      n += 1;
      const sid = `demo-session-${String(n).padStart(3, '0')}`;
      const started = hours(v.hoursAgo);
      const sessionSeconds = Math.round(v.active * 1.35) + (p.bot ? 2 : 8);
      const ended = new Date(started.getTime() + sessionSeconds * 1000);
      const device = { ...parseUserAgent(p.ua), screen: p.ua.includes('iPhone') || p.ua.includes('Android') ? '393x852' : '1512x982', tz: null, lang: 'en-US' };
      const ipinfo = { city: place.city, region: place.region, country: place.country, org: p.org, lat: place.lat, lon: place.lon, source: 'ipinfo' };
      const sections = v.sections.map(([key, seconds]) => ({ key, seconds }));
      const replay = v.replay ? syntheticReplay(started.getTime(), v.sections) : null;
      const replayJson = replay ? JSON.stringify(replay) : null;
      await db.query(
        `INSERT INTO sessions (sid, vid, started_at, ended_at, ip, ptr, user_agent, accept_language, referrer, page, is_mobile, geo, ipinfo,
                               device, bot_score, bot_reasons, is_bot, interactions, active_seconds, idle_seconds, session_seconds,
                               sections, pages, max_scroll_pct, ref_tag, link_id, session_cookie_id, fingerprint_id, event_count, replay_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '/', $10, $11::jsonb, $12::jsonb, $13::jsonb, $14, $15, $16, $17, $18, $19, $20,
                 $21::jsonb, '["/"]'::jsonb, $22, $23, $24, $25, $26, 0, $27)`,
        [
          sid,
          p.vid,
          started,
          ended,
          p.ip,
          p.ptr ?? null,
          p.ua,
          p.bot && p.ua === UA.curl ? '' : 'en-US,en;q=0.9',
          v.referrer ?? null,
          device.type !== 'desktop',
          JSON.stringify({ ...place, source: 'vercel' }),
          JSON.stringify(ipinfo),
          JSON.stringify(device),
          p.bot?.score ?? (v.clicks?.length ? 0 : 1),
          p.bot?.reasons ?? null,
          Boolean(p.bot),
          (v.clicks?.length ?? 0) + Math.round(v.active / 15),
          v.active,
          sessionSeconds - v.active,
          sessionSeconds,
          JSON.stringify(sections),
          v.scroll ?? null,
          p.tag ?? (p.link ? LINKS.find((l) => l.id === p.link)!.slug : null),
          p.link ?? null,
          `demo-scid-${p.vid}`,
          p.fpid ?? null,
          replayJson ? Buffer.byteLength(replayJson) : 0,
        ],
      );
      await db.query(`INSERT INTO session_ips (sid, ip, first_seen_at, last_seen_at) VALUES ($1, $2, $3, $4)`, [sid, p.ip, started, ended]);

      // Event timeline.
      const events: Array<[number, string, Record<string, unknown>]> = [[0, 'visit', { title: 'Sam Rivera — Portfolio' }]];
      let t = 2;
      for (const [key, seconds] of v.sections) {
        events.push([t, key === 'resume' ? 'section_enter' : 'section_view', { section: key }]);
        t += seconds;
      }
      for (const [i, target] of (v.clicks ?? []).entries()) {
        events.push([Math.round(((i + 1) * v.active) / ((v.clicks?.length ?? 0) + 1)), 'click_target', { target }]);
      }
      for (const pct of [25, 50, 75, 100]) if ((v.scroll ?? 0) >= pct) events.push([Math.round((pct / 100) * v.active), 'scroll_depth', { pct }]);
      if (v.clicks?.includes('github')) events.push([v.active, 'click_link', { host: 'github.com', path: '/' }]);
      events.sort((a, b) => a[0] - b[0]);
      for (const [i, [offset, type, data]] of events.entries()) {
        await db.query(`INSERT INTO events (sid, vid, ts, type, seq, data) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`, [
          sid,
          p.vid,
          new Date(started.getTime() + offset * 1000),
          type,
          i,
          JSON.stringify(data),
        ]);
      }
      await db.query(`UPDATE sessions SET event_count = $2 WHERE sid = $1`, [sid, events.length]);

      if (replayJson) {
        await db.query(`INSERT INTO replay_events (sid, vid, ts, chunk_seq, events, bytes) VALUES ($1, $2, $3, 0, $4::jsonb, $5)`, [
          sid,
          p.vid,
          started,
          replayJson,
          Buffer.byteLength(replayJson),
        ]);
      }

      if (!p.bot) {
        for (const e of buildIdentityEdges({ vid: p.vid, scid: `demo-scid-${p.vid}`, fpid: p.fpid ?? null, ip: p.ip, userAgent: p.ua })) {
          await db.query(
            `INSERT INTO identity_edges (a, b, kind, weight, decay_lambda, first_seen_at, last_seen_at, hits)
             VALUES ($1, $2, $3, $4, $5, $6, $6, 1)
             ON CONFLICT (a, b, kind) DO UPDATE SET last_seen_at = GREATEST(identity_edges.last_seen_at, EXCLUDED.last_seen_at)`,
            [e.a, e.b, e.kind, e.weight, e.decayLambda, started],
          );
        }
      }
    }
  }
}

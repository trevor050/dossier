import { describe, expect, it } from 'vitest';
import {
  buildIdentityEdges,
  clusterVisitors,
  EDGE_PROFILE,
  effectiveWeight,
  nodeIpUa,
  nodeVid,
  resolveLinks,
  type StoredEdge,
} from '../src/server/identity.js';

const now = new Date('2026-11-10T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

/** Edges for one visit, as the collector would store them. */
function visit(signals: { vid: string; scid?: string; fpid?: string; ip?: string; ua?: string }, at = now): StoredEdge[] {
  return buildIdentityEdges({
    vid: signals.vid,
    scid: signals.scid ?? null,
    fpid: signals.fpid ?? null,
    ip: signals.ip ?? null,
    userAgent: signals.ua ?? null,
  }).map((e) => ({ ...e, lastSeenAt: at }));
}

describe('buildIdentityEdges', () => {
  it('never creates an IP-only node', () => {
    const edges = buildIdentityEdges({ vid: 'v1', scid: null, fpid: null, ip: '1.2.3.4', userAgent: null });
    expect(edges).toEqual([]);
  });

  it('connects every pair of available signals with canonical ordering', () => {
    const edges = buildIdentityEdges({ vid: 'v1', scid: 's1', fpid: 'f1', ip: '1.2.3.4', userAgent: 'UA' });
    expect(edges.map((e) => e.kind).sort()).toEqual(['fp_ipua', 'scid_fp', 'scid_ipua', 'vid_fp', 'vid_ipua', 'vid_scid']);
    for (const e of edges) expect(e.a <= e.b).toBe(true);
    const ipua = edges.find((e) => e.kind === 'vid_ipua')!;
    expect([ipua.a, ipua.b].find((n) => n.startsWith('ipua:'))).toMatch(/^ipua:1\.2\.3\.4\|[0-9a-f]{16}$/);
  });
});

describe('effectiveWeight', () => {
  it('halves after one half-life', () => {
    const [edge] = visit({ vid: 'v1', ip: '1.1.1.1', ua: 'UA' }, hoursAgo(1));
    expect(edge!.kind).toBe('vid_ipua');
    expect(effectiveWeight(edge!, now)).toBeCloseTo(EDGE_PROFILE.vid_ipua.weight / 2, 5);
  });
});

describe('resolveLinks', () => {
  it('links two visitor ids that share a session cookie', () => {
    const edges = [...visit({ vid: 'a', scid: 'cookie' }), ...visit({ vid: 'b', scid: 'cookie' })];
    const [link] = resolveLinks('a', edges, { now });
    expect(link?.vid).toBe('b');
    expect(link?.sharedCookie).toBe(true);
    expect(link?.confidence).toBeCloseTo(0.95 * 0.95, 2);
  });

  it('does not link on IP + user agent alone (NAT, VPNs, coffee shops)', () => {
    const edges = [...visit({ vid: 'a', ip: '9.9.9.9', ua: 'Chrome' }), ...visit({ vid: 'b', ip: '9.9.9.9', ua: 'Chrome' })];
    expect(resolveLinks('a', edges, { now })).toEqual([]);
    // ...but the evidence is there at a low threshold, flagged as network-only.
    const weak = resolveLinks('a', edges, { now, threshold: 0.01 });
    expect(weak[0]).toMatchObject({ vid: 'b', sharedNetwork: true, sharedCookie: false });
  });

  it('links on a fresh fingerprint match, and stops linking once it decays', () => {
    const fresh = [...visit({ vid: 'a', fpid: 'fp1' }), ...visit({ vid: 'b', fpid: 'fp1' })];
    expect(resolveLinks('a', fresh, { now }).map((l) => l.vid)).toEqual(['b']);
    const old = [...visit({ vid: 'a', fpid: 'fp1' }, hoursAgo(24 * 120)), ...visit({ vid: 'b', fpid: 'fp1' }, hoursAgo(24 * 120))];
    expect(resolveLinks('a', old, { now })).toEqual([]);
  });

  it('combines independent shared signals with noisy-or', () => {
    const edges = [...visit({ vid: 'a', fpid: 'fp1', ip: '5.5.5.5', ua: 'X' }), ...visit({ vid: 'b', fpid: 'fp1', ip: '5.5.5.5', ua: 'X' })];
    const [link] = resolveLinks('a', edges, { now, threshold: 0 });
    const viaFp = 0.75 * 0.75;
    const viaNet = 0.2 * 0.2;
    expect(link!.confidence).toBeGreaterThan(viaFp);
    expect(link!.confidence).toBeCloseTo(1 - (1 - viaFp) * (1 - viaNet), 2);
  });

  it('does not let a long chain of weak links add up to confidence', () => {
    // a -ipua1- b -ipua2- c: two weak hops must be weaker than one, not stronger.
    const edges = [
      ...visit({ vid: 'a', ip: '1.0.0.1', ua: 'U' }),
      ...visit({ vid: 'b', ip: '1.0.0.1', ua: 'U' }),
    ];
    // b's second network, shared with c
    edges.push({ a: nodeVid('b'), b: nodeIpUa('1.0.0.2', 'U'), kind: 'vid_ipua', weight: 0.2, decayLambda: 0, lastSeenAt: now });
    edges.push({ a: nodeVid('c'), b: nodeIpUa('1.0.0.2', 'U'), kind: 'vid_ipua', weight: 0.2, decayLambda: 0, lastSeenAt: now });
    const links = resolveLinks('a', edges, { now, threshold: 0 });
    // Paths do not run through other visitor ids, so c is not reachable from a at all.
    expect(links.map((l) => l.vid)).toEqual(['b']);
  });
});

describe('clusterVisitors', () => {
  it('groups transitively linked visitors under the smallest id and leaves strangers alone', () => {
    const edges = [
      ...visit({ vid: 'v2', scid: 's1' }),
      ...visit({ vid: 'v3', scid: 's1', fpid: 'f9' }),
      ...visit({ vid: 'v4', fpid: 'f9' }),
      ...visit({ vid: 'v5', ip: '7.7.7.7', ua: 'Same' }),
      ...visit({ vid: 'v6', ip: '7.7.7.7', ua: 'Same' }),
    ];
    const people = clusterVisitors(['v2', 'v3', 'v4', 'v5', 'v6', 'v7'], edges, { now });
    expect(people.get('v3')).toBe('v2');
    expect(people.get('v4')).toBe('v2');
    expect(people.get('v5')).toBe('v5');
    expect(people.get('v6')).toBe('v6');
    expect(people.get('v7')).toBe('v7');
  });
});

import { createHash } from 'node:crypto';
import type { Db } from './db.js';

/**
 * Identity model
 * --------------
 * Every collected request contributes weighted, time-decaying edges between
 * signal nodes: the visitor id (`vid:`), the session cookie (`scid:`), the
 * optional browser fingerprint (`fp:`), and IP+user-agent (`ipua:`; IP is never
 * a node on its own because NAT and VPNs make it too noisy).
 *
 * Two visitor ids are "the same person" when the evidence connecting them is
 * strong enough:
 *   - a chain is only as strong as all of its links, so a path's strength is the
 *     product of its edges' effective weights;
 *   - independent short paths (two different shared signals) are combined with
 *     noisy-or: 1 - (1 - p1)(1 - p2).
 */

export type IdentityEdgeKind = 'vid_scid' | 'vid_fp' | 'vid_ipua' | 'scid_fp' | 'scid_ipua' | 'fp_ipua';

export type IdentityEdge = {
  a: string;
  b: string;
  kind: IdentityEdgeKind;
  /** Base strength, 0..1. */
  weight: number;
  /** Exponential decay rate per second. */
  decayLambda: number;
};

export type StoredEdge = IdentityEdge & { lastSeenAt: Date };

export type Link = {
  vid: string;
  confidence: number;
  sharedCookie: boolean;
  sharedFingerprint: boolean;
  sharedNetwork: boolean;
};

export const nodeVid = (vid: string) => `vid:${vid}`;
export const nodeScid = (scid: string) => `scid:${scid}`;
export const nodeFp = (fpid: string) => `fp:${fpid}`;
export function nodeIpUa(ip: string, userAgent: string): string {
  return `ipua:${ip}|${createHash('sha1').update(userAgent).digest('hex').slice(0, 16)}`;
}

export function halfLifeHoursToLambda(halfLifeHours: number): number {
  if (!Number.isFinite(halfLifeHours) || halfLifeHours <= 0) return 0;
  return Math.log(2) / (halfLifeHours * 3600);
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/** Edge weights and half-lives. Tuned for small sites where false merges are worse than misses. */
export const EDGE_PROFILE: Record<IdentityEdgeKind, { weight: number; halfLifeHours: number }> = {
  vid_scid: { weight: 0.95, halfLifeHours: 24 * 180 },
  vid_fp: { weight: 0.75, halfLifeHours: 24 * 45 },
  vid_ipua: { weight: 0.2, halfLifeHours: 1 },
  scid_fp: { weight: 0.85, halfLifeHours: 24 * 90 },
  scid_ipua: { weight: 0.35, halfLifeHours: 2 },
  fp_ipua: { weight: 0.25, halfLifeHours: 2 },
};

function edge(kind: IdentityEdgeKind, a: string, b: string): IdentityEdge {
  const p = EDGE_PROFILE[kind];
  const [x, y] = a <= b ? [a, b] : [b, a];
  return { a: x, b: y, kind, weight: p.weight, decayLambda: halfLifeHoursToLambda(p.halfLifeHours) };
}

export function buildIdentityEdges(signals: {
  vid: string;
  scid: string | null;
  fpid: string | null;
  ip: string | null;
  userAgent: string | null;
}): IdentityEdge[] {
  const vid = nodeVid(signals.vid);
  const scid = signals.scid ? nodeScid(signals.scid) : null;
  const fp = signals.fpid ? nodeFp(signals.fpid) : null;
  const ipua = signals.ip && signals.userAgent ? nodeIpUa(signals.ip, signals.userAgent) : null;
  const edges: IdentityEdge[] = [];
  if (scid) edges.push(edge('vid_scid', vid, scid));
  if (fp) edges.push(edge('vid_fp', vid, fp));
  if (ipua) edges.push(edge('vid_ipua', vid, ipua));
  if (scid && fp) edges.push(edge('scid_fp', scid, fp));
  if (scid && ipua) edges.push(edge('scid_ipua', scid, ipua));
  if (fp && ipua) edges.push(edge('fp_ipua', fp, ipua));
  return edges;
}

export function effectiveWeight(e: StoredEdge, now: Date): number {
  const ageSeconds = Math.max(0, (now.getTime() - e.lastSeenAt.getTime()) / 1000);
  return clamp01(e.weight * Math.exp(-e.decayLambda * ageSeconds));
}

type Adjacent = { node: string; w: number; kind: IdentityEdgeKind };

function adjacency(edges: StoredEdge[], now: Date, minEdge: number): Map<string, Adjacent[]> {
  const adj = new Map<string, Adjacent[]>();
  const push = (from: string, to: string, w: number, kind: IdentityEdgeKind) => {
    let list = adj.get(from);
    if (!list) adj.set(from, (list = []));
    const existing = list.find((x) => x.node === to);
    if (existing) {
      if (w > existing.w) Object.assign(existing, { w, kind });
    } else list.push({ node: to, w, kind });
  };
  for (const e of edges) {
    const w = effectiveWeight(e, now);
    if (w < minEdge) continue;
    push(e.a, e.b, w, e.kind);
    push(e.b, e.a, w, e.kind);
  }
  return adj;
}

const KIND_FLAGS: Record<IdentityEdgeKind, Array<'cookie' | 'fp' | 'net'>> = {
  vid_scid: ['cookie'],
  vid_fp: ['fp'],
  vid_ipua: ['net'],
  scid_fp: ['cookie', 'fp'],
  scid_ipua: ['cookie', 'net'],
  fp_ipua: ['fp', 'net'],
};

/**
 * Visitors linked to `vid`, strongest first. Pure function over a list of stored edges.
 */
export function resolveLinks(
  vid: string,
  edges: StoredEdge[],
  opts: { now?: Date; threshold?: number; minEdge?: number; maxHops?: number } = {},
): Link[] {
  const now = opts.now ?? new Date();
  const threshold = opts.threshold ?? 0.5;
  const maxHops = opts.maxHops ?? 4;
  const adj = adjacency(edges, now, opts.minEdge ?? 0.02);
  const seed = nodeVid(vid);

  // Best (max-product) path to every reachable node, bounded by hop count.
  type State = { p: number; hops: number; flags: Set<string> };
  const best = new Map<string, State>([[seed, { p: 1, hops: 0, flags: new Set() }]]);
  let frontier = [seed];
  for (let hop = 1; hop <= maxHops && frontier.length; hop++) {
    const next: string[] = [];
    for (const node of frontier) {
      const from = best.get(node)!;
      // Paths do not continue through other visitor ids: a vid is an endpoint.
      if (node !== seed && node.startsWith('vid:')) continue;
      for (const { node: to, w, kind } of adj.get(node) ?? []) {
        const p = from.p * w;
        const cur = best.get(to);
        if (cur && cur.p >= p) continue;
        best.set(to, { p, hops: hop, flags: new Set([...from.flags, ...KIND_FLAGS[kind]]) });
        next.push(to);
      }
    }
    frontier = next;
  }

  // Independent evidence: each signal node shared directly by both visitors is its own 2-hop path.
  const direct = new Map<string, { miss: number; flags: Set<string> }>();
  for (const { node: sig, w: w1, kind: k1 } of adj.get(seed) ?? []) {
    for (const { node: other, w: w2, kind: k2 } of adj.get(sig) ?? []) {
      if (other === seed || !other.startsWith('vid:')) continue;
      const entry = direct.get(other) ?? { miss: 1, flags: new Set<string>() };
      entry.miss *= 1 - w1 * w2;
      for (const f of [...KIND_FLAGS[k1], ...KIND_FLAGS[k2]]) entry.flags.add(f);
      direct.set(other, entry);
    }
  }

  const links: Link[] = [];
  for (const [node, state] of best) {
    if (node === seed || !node.startsWith('vid:')) continue;
    const d = direct.get(node);
    const confidence = Math.max(state.p, d ? 1 - d.miss : 0);
    if (confidence < threshold) continue;
    const flags = d && 1 - d.miss >= state.p ? d.flags : state.flags;
    links.push({
      vid: node.slice(4),
      confidence: Math.round(confidence * 1000) / 1000,
      sharedCookie: flags.has('cookie'),
      sharedFingerprint: flags.has('fp'),
      sharedNetwork: flags.has('net'),
    });
  }
  return links.sort((x, y) => y.confidence - x.confidence || x.vid.localeCompare(y.vid));
}

/**
 * Group visitor ids into people. Returns a map from each vid to a stable
 * person id (the lexicographically smallest member vid).
 */
export function clusterVisitors(
  vids: string[],
  edges: StoredEdge[],
  opts: { now?: Date; threshold?: number } = {},
): Map<string, string> {
  const parent = new Map<string, string>(vids.map((v) => [v, v]));
  const find = (v: string): string => {
    let root = v;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = v;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const known = new Set(vids);
  for (const vid of vids) {
    for (const link of resolveLinks(vid, edges, opts)) {
      if (!known.has(link.vid)) continue;
      const a = find(vid);
      const b = find(link.vid);
      if (a === b) continue;
      if (a < b) parent.set(b, a);
      else parent.set(a, b);
    }
  }
  return new Map(vids.map((v) => [v, find(v)]));
}

export async function upsertIdentityEdges(db: Db, edges: IdentityEdge[]): Promise<void> {
  for (const e of edges) {
    await db.query(
      `INSERT INTO identity_edges (a, b, kind, weight, decay_lambda, first_seen_at, last_seen_at, hits)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1)
       ON CONFLICT (a, b, kind) DO UPDATE SET
         last_seen_at = NOW(),
         hits = identity_edges.hits + 1,
         weight = GREATEST(identity_edges.weight, EXCLUDED.weight),
         decay_lambda = LEAST(identity_edges.decay_lambda, EXCLUDED.decay_lambda)`,
      [e.a, e.b, e.kind, clamp01(e.weight), Math.max(0, e.decayLambda)],
    );
  }
}

/** Load edges that still carry meaningful weight. */
export async function loadEdges(db: Db, minEffective = 0.02): Promise<StoredEdge[]> {
  const { rows } = await db.query<{
    a: string;
    b: string;
    kind: IdentityEdgeKind;
    weight: number;
    decay_lambda: number;
    last_seen_at: Date | string;
  }>(
    `SELECT a, b, kind, weight, decay_lambda, last_seen_at
       FROM identity_edges
      WHERE weight * EXP(-decay_lambda * EXTRACT(EPOCH FROM (NOW() - last_seen_at))) >= $1
      LIMIT 50000`,
    [minEffective],
  );
  return rows.map((r) => ({
    a: r.a,
    b: r.b,
    kind: r.kind,
    weight: Number(r.weight),
    decayLambda: Number(r.decay_lambda),
    lastSeenAt: new Date(r.last_seen_at),
  }));
}

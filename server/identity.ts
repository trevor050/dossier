import { createHash } from 'node:crypto';
import { query } from './db.js';

export type IdentityEdgeKind =
  | 'vid_scid'
  | 'vid_fp'
  | 'vid_ipua'
  | 'scid_fp'
  | 'scid_ipua'
  | 'fp_ipua';

export type IdentityEdge = {
  a: string;
  b: string;
  kind: IdentityEdgeKind;
  weight: number; // 0..1 (base)
  decayLambda: number; // per-second
};

export type ResolvedIdentity = {
  vid: string;
  confidence: number; // 0..1
  shared_cookie: boolean;
  shared_fingerprint: boolean;
  shared_ip: boolean; // ip+ua node match
};

function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export function makeNodeVid(vid: string): string {
  return `vid:${vid}`;
}

export function makeNodeScid(scid: string): string {
  return `scid:${scid}`;
}

export function makeNodeFingerprint(fpid: string): string {
  return `fp:${fpid}`;
}

export function makeNodeIpUa(ip: string, userAgent: string): string {
  const uaHash = sha1Hex(userAgent).slice(0, 16);
  return `ipua:${ip}|${uaHash}`;
}

export function halfLifeHoursToLambda(halfLifeHours: number): number {
  if (!Number.isFinite(halfLifeHours) || halfLifeHours <= 0) return 0;
  const halfLifeSeconds = halfLifeHours * 60 * 60;
  return Math.log(2) / halfLifeSeconds;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function canonicalizeEdge(a: string, b: string): { a: string; b: string } {
  return a <= b ? { a, b } : { a: b, b: a };
}

export async function upsertIdentityEdge(edge: IdentityEdge): Promise<void> {
  const { a, b } = canonicalizeEdge(edge.a, edge.b);
  const weight = clamp01(edge.weight);
  const decayLambda = Math.max(0, edge.decayLambda);

  await query(
    `
      INSERT INTO identity_edges (a, b, kind, weight, decay_lambda, first_seen_at, last_seen_at, hits)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), 1)
      ON CONFLICT (a, b, kind) DO UPDATE SET
        last_seen_at = NOW(),
        hits = identity_edges.hits + 1,
        weight = GREATEST(identity_edges.weight, EXCLUDED.weight),
        decay_lambda = GREATEST(identity_edges.decay_lambda, EXCLUDED.decay_lambda)
    `,
    [a, b, edge.kind, weight, decayLambda],
  );
}

export type IdentitySignals = {
  vid: string;
  scid: string | null;
  fpid: string | null;
  ip: string | null;
  userAgent: string;
};

export function buildIdentityEdges(signals: IdentitySignals): IdentityEdge[] {
  const edges: IdentityEdge[] = [];

  const vidNode = makeNodeVid(signals.vid);
  const scidNode = signals.scid ? makeNodeScid(signals.scid) : null;
  const fpNode = signals.fpid ? makeNodeFingerprint(signals.fpid) : null;

  // IP is never used as a standalone identity node (too noisy).
  // If we have IP + UA, use a combined node that decays quickly.
  const ipUaNode = signals.ip && signals.userAgent ? makeNodeIpUa(signals.ip, signals.userAgent) : null;

  // Secure cookie: strong, slow decay.
  if (scidNode) {
    edges.push({
      a: vidNode,
      b: scidNode,
      kind: 'vid_scid',
      weight: 0.95,
      decayLambda: halfLifeHoursToLambda(24 * 180),
    });
  }

  // FingerprintJS: medium, moderate decay (iOS/private-mode churn).
  if (fpNode) {
    edges.push({
      a: vidNode,
      b: fpNode,
      kind: 'vid_fp',
      weight: 0.7,
      decayLambda: halfLifeHoursToLambda(24 * 45),
    });
  }

  // IP (+ UA): weak, fast decay. Intended for short windows only.
  if (ipUaNode) {
    edges.push({
      a: vidNode,
      b: ipUaNode,
      kind: 'vid_ipua',
      weight: 0.2,
      decayLambda: halfLifeHoursToLambda(1),
    });
  }

  // Cross-signal edges help connect when `vid` changes (private mode).
  if (scidNode && fpNode) {
    edges.push({
      a: scidNode,
      b: fpNode,
      kind: 'scid_fp',
      weight: 0.85,
      decayLambda: halfLifeHoursToLambda(24 * 90),
    });
  }

  if (scidNode && ipUaNode) {
    edges.push({
      a: scidNode,
      b: ipUaNode,
      kind: 'scid_ipua',
      weight: 0.35,
      decayLambda: halfLifeHoursToLambda(2),
    });
  }

  if (fpNode && ipUaNode) {
    edges.push({
      a: fpNode,
      b: ipUaNode,
      kind: 'fp_ipua',
      weight: 0.25,
      decayLambda: halfLifeHoursToLambda(2),
    });
  }

  return edges;
}

export class GraphService {
  static async resolveRelatedVisitors(opts: {
    vid: string;
    confidenceThreshold?: number;
    maxDepth?: number;
    limit?: number;
    minEdgeWeight?: number;
  }): Promise<ResolvedIdentity[]> {
    const confidenceThreshold = clamp01(opts.confidenceThreshold ?? 0.85);
    const maxDepth = Math.max(1, Math.min(8, opts.maxDepth ?? 5));
    const limit = Math.max(1, Math.min(120, opts.limit ?? 40));
    const minEdgeWeight = clamp01(opts.minEdgeWeight ?? 0.15);

    const seed = makeNodeVid(opts.vid);

    // Combine evidence with a "noisy-or" model:
    // conf' = 1 - (1-conf) * (1-edgeWeightEffective)
    // This increases confidence as independent evidence accumulates.
    const res = await query<any>(
      `
        WITH RECURSIVE walk AS (
          SELECT
            $1::text AS node,
            0::double precision AS conf,
            ARRAY[$1::text] AS path,
            false AS used_cookie,
            false AS used_fp,
            false AS used_ipua
          UNION ALL
          SELECT
            step.next_node AS node,
            (1 - (1 - w.conf) * (1 - step.e_w)) AS conf,
            w.path || step.next_node,
            (w.used_cookie OR step.kind IN ('vid_scid','scid_fp','scid_ipua')) AS used_cookie,
            (w.used_fp OR step.kind IN ('vid_fp','scid_fp','fp_ipua')) AS used_fp,
            (w.used_ipua OR step.kind IN ('vid_ipua','scid_ipua','fp_ipua')) AS used_ipua
          FROM walk w
          JOIN LATERAL (
            SELECT
              CASE WHEN ie.a = w.node THEN ie.b ELSE ie.a END AS next_node,
              ie.kind,
              (ie.weight * EXP(-ie.decay_lambda * EXTRACT(EPOCH FROM (NOW() - ie.last_seen_at)))) AS e_w
            FROM identity_edges ie
            WHERE (ie.a = w.node OR ie.b = w.node)
          ) step ON true
          WHERE
            step.e_w >= $2
            AND NOT (step.next_node = ANY(w.path))
            AND array_length(w.path, 1) < $3
        ),
        vids AS (
          SELECT
            substring(node from 5) AS vid,
            conf,
            used_cookie,
            used_fp,
            used_ipua
          FROM walk
          WHERE node LIKE 'vid:%' AND node <> $1
        )
        SELECT
          vid,
          MAX(conf) AS confidence,
          BOOL_OR(used_cookie) AS shared_cookie,
          BOOL_OR(used_fp) AS shared_fingerprint,
          BOOL_OR(used_ipua) AS shared_ip
        FROM vids
        GROUP BY vid
        HAVING MAX(conf) >= $4
        ORDER BY confidence DESC
        LIMIT $5
      `,
      [seed, minEdgeWeight, maxDepth, confidenceThreshold, limit],
    );

    return (res.rows || []).map((r: any) => ({
      vid: r.vid,
      confidence: Number(r.confidence ?? 0),
      shared_cookie: Boolean(r.shared_cookie),
      shared_fingerprint: Boolean(r.shared_fingerprint),
      shared_ip: Boolean(r.shared_ip),
    }));
  }
}


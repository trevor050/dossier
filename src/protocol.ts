/** Wire format shared by the browser tracker and the collector. */

export type WireEvent = {
  type: string;
  ts: string;
  seq: number;
  data?: Record<string, unknown>;
};

export type Dwell = { key: string; seconds: number };

export type WireSummary = {
  session_seconds?: number;
  active_seconds?: number;
  idle_seconds?: number;
  interactions?: number;
  first_interaction_seconds?: number | null;
  /** Seconds each `[data-section]` / `section[id]` element was on screen while the visitor was active. */
  sections?: Dwell[];
  /** Legacy (0.1): app-reported overlay dwell. Still accepted. */
  overlays?: Dwell[];
  overlays_unique?: number;
  pages?: string[];
  max_scroll_pct?: number;
};

export type WireClient = {
  webdriver?: boolean;
  screen?: string;
  tz?: string;
  lang?: string;
};

export type CollectBody = {
  vid: string;
  sid: string;
  scid?: string;
  fpid?: string;
  ref_tag?: string;
  page?: string;
  referrer?: string;
  is_mobile?: boolean;
  orientation?: 'portrait' | 'landscape';
  events?: WireEvent[];
  summary?: WireSummary;
  client?: WireClient;
  /** Set by the tracker when the visitor opted out mid-session; the collector drops the request. */
  internal?: boolean;
};

export type ReplayBody = {
  vid: string;
  sid: string;
  chunk_seq?: number;
  events: unknown[];
};

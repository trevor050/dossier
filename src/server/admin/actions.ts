/**
 * One user action can arrive as several events: a click on a tracked element
 * that opens an overlay may be reported as `click_target` + `open_overlay`, and
 * a click on a tracked link as `click_target` + `click_link`. Counting events
 * would count the action twice, so secondary events that accompany a
 * `click_target` are folded into it. Sites that send only one of the types are
 * unaffected: an unpaired secondary event still counts on its own.
 */

export type ActionEvent = {
  ts: string | Date;
  type: string;
  data: Record<string, unknown> | null;
  sid?: string;
};

export type Collapsed<T extends ActionEvent> = T & { also?: T[] };

export const ACTION_TYPES = ['click_target', 'open_overlay', 'click_link'] as const;

/** How close (ms) a secondary event must be to the click it belongs to. */
const WINDOW_MS: Record<string, number> = { open_overlay: 2000, click_link: 1000 };

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function actionLabel(e: ActionEvent): string {
  const d = e.data ?? {};
  if (e.type === 'click_target') return str(d.target) || e.type;
  if (e.type === 'open_overlay') return str(d.overlay) || e.type;
  if (e.type === 'click_link') return `${str(d.host)}${str(d.path)}` || e.type;
  return e.type;
}

function belongsTo(secondary: ActionEvent, primary: ActionEvent): boolean {
  if (secondary.sid !== primary.sid) return false;
  const window = WINDOW_MS[secondary.type];
  if (window == null) return false;
  if (Math.abs(new Date(secondary.ts).getTime() - new Date(primary.ts).getTime()) > window) return false;
  // An overlay must be the one the click named; a link click has no shared label, timing is the signal.
  return secondary.type !== 'open_overlay' || actionLabel(secondary) === actionLabel(primary);
}

/** Fold secondary events into the click they accompany. Input order is preserved for what remains. */
export function collapseActions<T extends ActionEvent>(events: T[]): Array<Collapsed<T>> {
  const primaries = events.filter((e) => e.type === 'click_target');
  const absorbed = new Set<T>();
  const also = new Map<T, T[]>();
  for (const e of events) {
    if (!(e.type in WINDOW_MS)) continue;
    const match = primaries
      .filter((p) => belongsTo(e, p) && !(also.get(p) ?? []).some((x) => x.type === e.type))
      .sort((a, b) => Math.abs(new Date(a.ts).getTime() - new Date(e.ts).getTime()) - Math.abs(new Date(b.ts).getTime() - new Date(e.ts).getTime()))[0];
    if (!match) continue;
    absorbed.add(e);
    also.set(match, [...(also.get(match) ?? []), e]);
  }
  return events.filter((e) => !absorbed.has(e)).map((e) => (also.has(e) ? { ...e, also: also.get(e)! } : e));
}

/** User actions per label, one count per action. */
export function countActions(events: ActionEvent[], limit = 20): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const e of collapseActions(events)) {
    if (!(ACTION_TYPES as readonly string[]).includes(e.type)) continue;
    const label = actionLabel(e);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

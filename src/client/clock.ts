/**
 * Tracks how long a visitor was actually present. Time counts as active while
 * the tab is visible and the last sign of life (pointer, key, scroll, focus) was
 * less than `idleAfterMs` ago. Pure: time is injected, so it is easy to test.
 */
export class ActivityClock {
  private readonly startedAt: number;
  private activeMs = 0;
  private segmentStart: number | null = null;
  private lastActivity: number;
  private hidden = false;
  private interactionCount = 0;
  private firstInteractionAt: number | null = null;

  constructor(
    now: number,
    private readonly idleAfterMs = 30_000,
    visible = true,
  ) {
    this.startedAt = now;
    this.lastActivity = now;
    this.hidden = !visible;
    if (visible) this.segmentStart = now;
  }

  private segmentEnd(now: number): number {
    return Math.min(now, this.lastActivity + this.idleAfterMs);
  }

  private closeSegment(now: number) {
    if (this.segmentStart == null) return;
    this.activeMs += Math.max(0, this.segmentEnd(now) - this.segmentStart);
    this.segmentStart = null;
  }

  /** A sign of presence. `interaction` marks deliberate input (click, tap, key). */
  activity(now: number, interaction = false): void {
    if (interaction) {
      this.interactionCount += 1;
      if (this.firstInteractionAt == null) this.firstInteractionAt = now;
    }
    if (this.hidden) return;
    if (this.segmentStart != null && now - this.lastActivity > this.idleAfterMs) this.closeSegment(now);
    if (this.segmentStart == null) this.segmentStart = now;
    this.lastActivity = Math.max(this.lastActivity, now);
  }

  setVisible(visible: boolean, now: number): void {
    if (!visible) {
      this.closeSegment(now);
      this.hidden = true;
      return;
    }
    if (this.hidden) {
      this.hidden = false;
      this.activity(now);
    }
  }

  isIdle(now: number): boolean {
    return this.hidden || this.segmentStart == null || now - this.lastActivity > this.idleAfterMs;
  }

  activeMsAt(now: number): number {
    if (this.segmentStart == null) return this.activeMs;
    return this.activeMs + Math.max(0, this.segmentEnd(now) - this.segmentStart);
  }

  snapshot(now: number) {
    const sessionMs = Math.max(0, now - this.startedAt);
    const activeMs = Math.min(sessionMs, this.activeMsAt(now));
    return {
      session_seconds: Math.round(sessionMs / 1000),
      active_seconds: Math.round(activeMs / 1000),
      idle_seconds: Math.max(0, Math.round((sessionMs - activeMs) / 1000)),
      interactions: this.interactionCount,
      first_interaction_seconds:
        this.firstInteractionAt == null ? null : Math.round((this.firstInteractionAt - this.startedAt) / 1000),
    };
  }
}

/**
 * Attributes active time to whatever the visitor is looking at: the section
 * nearest the middle of the viewport, or an explicitly entered key (modals,
 * overlays, canvas scenes) which takes precedence.
 */
export class DwellCounter {
  private readonly totals = new Map<string, number>();
  private manual: string[] = [];
  private lastActiveMs = 0;

  /** Credit the active time accrued since the last call to the current focus. */
  credit(activeMs: number, domFocus: string | null): void {
    const delta = activeMs - this.lastActiveMs;
    this.lastActiveMs = activeMs;
    const key = this.focus(domFocus);
    if (key && delta > 0) this.totals.set(key, (this.totals.get(key) ?? 0) + delta);
  }

  focus(domFocus: string | null): string | null {
    return this.manual[this.manual.length - 1] ?? domFocus;
  }

  enter(key: string): void {
    this.manual = this.manual.filter((k) => k !== key);
    this.manual.push(key);
  }

  leave(key?: string): void {
    if (key == null) this.manual.pop();
    else this.manual = this.manual.filter((k) => k !== key);
  }

  list(limit = 50): Array<{ key: string; seconds: number }> {
    return [...this.totals.entries()]
      .map(([key, ms]) => ({ key, seconds: Math.round(ms / 1000) }))
      .filter((d) => d.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, limit);
  }
}

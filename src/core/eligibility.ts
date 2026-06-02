// Whether a nudge is due for a user RIGHT NOW. Pure: the caller passes `now`,
// and the timezone math comes from the shared kernel (getLocalContext), so
// every branch is testable without a real clock.
//
// A nudge is due only when ALL of these hold:
//   - the user is not paused and not blocked,
//   - they are not currently snoozed (snoozeUntil is null or already passed),
//   - the user's CURRENT LOCAL hour is OUTSIDE their quiet window, and
//   - enough whole days have passed since the last nudge (cadence), or they
//     have never been nudged.
//
// Everything is decided in the user's own timezone so "every 3 days" and the
// quiet hours mean what the user expects no matter where the server runs.

import { getLocalContext } from './schedule';

/** The few user fields the eligibility check needs. */
export interface EligibilityUser {
  timezone: string;
  cadenceDays: number;
  quietStartHour: number;
  quietEndHour: number;
  snoozeUntil: Date | null;
  paused: boolean;
  blocked: boolean;
}

export interface IsNudgeDueArgs {
  now: Date;
  user: EligibilityUser;
  /** When the last nudge was sent; null = never nudged. */
  lastNudgeAt: Date | null;
}

/**
 * Is `localHour` inside the quiet window [quietStart, quietEnd)?
 *
 * The window is half-open on the local hour: a nudge is suppressed from
 * quietStart up to (but not including) quietEnd. The window may wrap past
 * midnight — start 22, end 8 means quiet from 22:00 through 07:59, awake from
 * 08:00. When start == end we treat it as "no quiet hours" (never quiet), the
 * least surprising reading of an empty window.
 */
export function isQuietHour(localHour: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart === quietEnd) return false; // empty window: never quiet
  if (quietStart < quietEnd) {
    // Same-day window, e.g. 0..6 → quiet 00:00–05:59.
    return localHour >= quietStart && localHour < quietEnd;
  }
  // Wrap-around window, e.g. 22..8 → quiet 22,23,0..7.
  return localHour >= quietStart || localHour < quietEnd;
}

/** Whole days between two local "YYYY-MM-DD" date strings (b - a, a ≤ b). */
function wholeDaysBetween(a: string, b: string): number {
  // Parse as UTC midnights so DST never adds or drops an hour here; we only
  // care about the calendar-day difference, not elapsed wall-clock time.
  const aMs = Date.parse(`${a}T00:00:00Z`);
  const bMs = Date.parse(`${b}T00:00:00Z`);
  return Math.round((bMs - aMs) / 86_400_000);
}

/** Decide whether to send a nudge to `user` at instant `now`. */
export function isNudgeDue({ now, user, lastNudgeAt }: IsNudgeDueArgs): boolean {
  if (user.paused || user.blocked) return false;

  // Snoozed and the snooze has not yet elapsed.
  if (user.snoozeUntil && user.snoozeUntil.getTime() > now.getTime()) return false;

  const local = getLocalContext(user.timezone, now);
  const localHour = Math.floor(local.minutesSinceMidnight / 60);
  if (isQuietHour(localHour, user.quietStartHour, user.quietEndHour)) return false;

  // Never nudged: due as soon as we are past quiet hours.
  if (!lastNudgeAt) return true;

  // Cadence: compare the user's LOCAL calendar date of the last nudge with the
  // local date now. The cadence is met when at least cadenceDays whole days
  // have passed (boundary inclusive: exactly N days is due).
  const lastLocal = getLocalContext(user.timezone, lastNudgeAt);
  return wholeDaysBetween(lastLocal.date, local.date) >= user.cadenceDays;
}

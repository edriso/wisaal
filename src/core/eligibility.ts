// Whether a nudge may go out, decided in two pure layers (both take `now`, so
// every branch is testable without a real clock; the timezone math comes from
// the shared kernel's getLocalContext):
//
//   1. isUserAvailable — is the USER in a state to receive any nudge at all?
//      i.e. not paused, not blocked, not currently snoozed, and the local clock
//      is outside their quiet window.
//   2. isPersonDue — is a given RELATIVE due, by THEIR own cadence? i.e. never
//      contacted, or at least cadenceDays whole local days have passed since
//      they were last contacted.
//
// Splitting it this way is the heart of per-relative cadence: the user gate is
// shared, but each relative becomes due on their own schedule. The scheduler
// nudges only when the user is available AND at least one relative is due,
// still at most one relative (and one nudge) per local day.
//
// Everything is decided in the user's own timezone so "every week" and the
// quiet hours mean what the user expects no matter where the server runs.

import { getLocalContext } from './schedule';

/** The few user fields the availability check needs. */
export interface EligibilityUser {
  timezone: string;
  quietStartHour: number;
  quietEndHour: number;
  snoozeUntil: Date | null;
  paused: boolean;
  blocked: boolean;
}

export interface IsUserAvailableArgs {
  now: Date;
  user: EligibilityUser;
}

/** The few Person fields the per-relative due check needs. */
export interface DueCandidate {
  /** When this person was last marked contacted; null = never contacted. */
  lastContactedAt: Date | null;
  /** Whole local days to wait after a contact before this person is due again. */
  cadenceDays: number;
}

export interface IsPersonDueArgs {
  now: Date;
  /** The user's IANA timezone — the cadence is measured in their local days. */
  timezone: string;
  person: DueCandidate;
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

/**
 * Is the user in a state to receive any nudge right now? (Not paused, not
 * blocked, not currently snoozed, and outside their local quiet window.)
 * Whether a specific relative is actually due is a separate question — see
 * isPersonDue.
 */
export function isUserAvailable({ now, user }: IsUserAvailableArgs): boolean {
  if (user.paused || user.blocked) return false;

  // Snoozed and the snooze has not yet elapsed.
  if (user.snoozeUntil && user.snoozeUntil.getTime() > now.getTime()) return false;

  const local = getLocalContext(user.timezone, now);
  const localHour = Math.floor(local.minutesSinceMidnight / 60);
  return !isQuietHour(localHour, user.quietStartHour, user.quietEndHour);
}

/**
 * Is this relative due, by their own cadence, at instant `now`?
 *
 * Due when never contacted, or when at least `cadenceDays` whole LOCAL calendar
 * days have passed since the last contact (boundary inclusive: exactly N days
 * is due). Measured in the user's timezone so the cadence means what they
 * expect regardless of the server's clock.
 */
export function isPersonDue({ now, timezone, person }: IsPersonDueArgs): boolean {
  // Never contacted: always due (and the rotation picks them first anyway).
  if (person.lastContactedAt === null) return true;

  const lastLocal = getLocalContext(timezone, person.lastContactedAt);
  const nowLocal = getLocalContext(timezone, now);
  return wholeDaysBetween(lastLocal.date, nowLocal.date) >= person.cadenceDays;
}

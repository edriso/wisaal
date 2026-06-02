// A pure picker over the reminder list. Deterministic by day so that, within a
// single calendar day (UTC), a user keeps seeing the same encouragement no
// matter how many times the view is rebuilt, while it rotates day to day.
//
// The content itself lives in src/database/reference/reminders.ts (it is data,
// authored once, never hand-edited). This module only chooses an index; keeping
// the choice here, in core, keeps it pure and unit-testable.

import { reminders, type Reminder } from '../database/reference/reminders';

/** Number of whole days since the Unix epoch for an instant (UTC calendar). */
function dayNumber(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * Pick a reminder. By default it is chosen deterministically from the day, so
 * it is stable within a UTC day and walks the list across days. Pass an
 * explicit `index` to force a specific one (it is taken modulo the list length,
 * so any integer is safe).
 */
export function pickReminder(now: Date, index?: number): Reminder {
  const i = index ?? dayNumber(now);
  // Modulo guarded to a non-negative index even if a negative is passed.
  const safe = ((i % reminders.length) + reminders.length) % reminders.length;
  return reminders[safe];
}

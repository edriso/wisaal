import type { Bot, Context } from 'grammy';
import {
  getLocalContext,
  isPersonDue,
  isUserAvailable,
  pickReminder,
  sortByContactPriority,
} from '../core';
import {
  prisma,
  claimNudge,
  hasNudgeFor,
  listPeople,
  setBlocked,
  type RotationPerson,
} from '../database';
import { nudgeMessage, personLabel } from './copy';
import { sendMessage } from './send';
import { logger } from './logger';

export interface NudgeStats {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** The user fields the nudge loop and the view builder need. */
export interface NudgeUser {
  id: number;
  telegramId: bigint;
  timezone: string;
  quietStartHour: number;
  quietEndHour: number;
  snoozeUntil: Date | null;
  paused: boolean;
  blocked: boolean;
}

/**
 * What a nudge looks like for a user right now, and whether it should be
 * recorded as this cycle's nudge (so the scheduler then skips them). Mirrors
 * ayah's TodayView.
 */
export interface NudgeView {
  /** The plain-text nudge to send, or null when the circle is empty. */
  message: string | null;
  /** The person the nudge is about, or null when the circle is empty. */
  person: RotationPerson | null;
  /**
   * Set when this view should be CLAIMED as this cycle's nudge. The caller
   * records it AFTER the message is shown, so a failed send leaves the cycle
   * unclaimed and the scheduler delivers next tick. Null when there is nothing
   * to claim (empty circle, or already nudged this local day — a re-show).
   */
  claim: { scheduledFor: string; personId: number | null } | null;
  /** True when this user was already nudged for their current local date. */
  alreadyNudged: boolean;
}

/**
 * Build the nudge view for a user: the most-due relative plus a rotating
 * encouragement, and whether it counts as this cycle's nudge.
 *
 * `claimable` controls whether a fresh (not-yet-nudged) cycle should be claimed.
 * The scheduler passes true only for available users; /now passes true so
 * reading the nudge early "claims" the cycle exactly like ayah's /today. On an
 * already-nudged local day the same nudge is re-shown without claiming again.
 *
 * `dueOnly` controls who is eligible to be picked. The scheduler passes true,
 * so it only ever surfaces a relative whose own cadence has come round (and
 * yields an empty view when nobody is due, so the user is left in peace). /now
 * passes false: an on-demand pull always answers with whoever is next in the
 * rotation, due or not.
 */
export async function buildNudgeView(
  user: NudgeUser,
  people: readonly RotationPerson[],
  now: Date,
  opts: { claimable?: boolean; dueOnly?: boolean } = {},
): Promise<NudgeView> {
  const { claimable = true, dueOnly = false } = opts;
  // One fair ordering (never-contacted first, then least-recently contacted);
  // the scheduler then takes the first who is also due by their own cadence.
  const ordered = sortByContactPriority(people);
  const person = dueOnly
    ? (ordered.find((p) => isPersonDue({ now, timezone: user.timezone, person: p })) ?? null)
    : (ordered[0] ?? null);
  if (!person) {
    return { message: null, person: null, claim: null, alreadyNudged: false };
  }

  const reminder = pickReminder(now);
  const message = nudgeMessage(personLabel(person.name, person.relation), reminder);

  const scheduledFor = getLocalContext(user.timezone, now).date;
  const alreadyNudged = await hasNudgeFor(user.id, scheduledFor);

  // Claim only when the cycle is genuinely free: caller allows it AND we have
  // not already nudged this local day. A re-show (already nudged) never claims.
  const claim = claimable && !alreadyNudged ? { scheduledFor, personId: person.id } : null;
  return { message, person, claim, alreadyNudged };
}

/**
 * The heart of the bot: find every user with a relative due right now and send
 * one nudge. Safe to run every minute and safe to run twice for the same
 * minute, because:
 *   - isUserAvailable gates per-user (their own timezone, quiet hours, pause,
 *     snooze) and the per-relative cadence (isPersonDue, applied inside
 *     buildNudgeView via dueOnly) decides whether anyone is actually due.
 *   - a (user, local date) nudge record makes it nudge at most once per local
 *     day, even on a restart catch-up or a double cron fire (the unique lock).
 *   - one user failing is caught and never stops the rest.
 *   - the cycle is claimed (and lastNudgeAt advances) ONLY after a successful
 *     send, so a failed send re-nudges next tick instead of skipping the cycle.
 *
 * A user who is available but has nobody due (everyone contacted recently
 * enough, or an empty circle) is silently left in peace — the resting state for
 * most users on most days, so it is not counted.
 */
export async function deliverDueUsers(
  bot: Bot<Context>,
  now: Date = new Date(),
): Promise<NudgeStats> {
  // Reachable users only; isUserAvailable still re-checks blocked/paused.
  const users = await prisma.user.findMany({ where: { blocked: false } });
  const stats: NudgeStats = { due: 0, sent: 0, skipped: 0, failed: 0 };

  for (const user of users) {
    try {
      if (!isUserAvailable({ now, user })) continue;

      const scheduledFor = getLocalContext(user.timezone, now).date;
      if (await hasNudgeFor(user.id, scheduledFor)) {
        stats.skipped++; // already nudged this local day
        continue;
      }

      const people = await listPeople(user.id);
      const view = await buildNudgeView(user, people, now, { claimable: true, dueOnly: true });
      if (!view.message || !view.claim) continue; // empty circle, or nobody due right now
      stats.due++;

      const result = await sendMessage(bot, user.telegramId, view.message);
      if (result === 'blocked') {
        await setBlocked(user.id, true);
        stats.failed++;
        continue;
      }
      if (result === 'failed') {
        stats.failed++;
        continue; // do NOT claim/advance; retried next tick
      }

      const claimed = await claimNudge({
        userId: user.id,
        personId: view.claim.personId,
        scheduledFor: view.claim.scheduledFor,
        now,
      });
      if (claimed === 'nudged') stats.sent++;
      else stats.skipped++; // a race claimed the same day first
    } catch (err) {
      stats.failed++;
      logger.error('Nudge failed for user', { id: user.id, error: String(err) });
    }
  }

  return stats;
}

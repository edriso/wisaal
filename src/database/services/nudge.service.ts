import { prisma } from '../client';

// NudgeLog.action allowed values (kept as a short string, not a Prisma enum,
// matching the schema comment and the other bots).
export type NudgeAction = 'nudged' | 'contacted' | 'snoozed' | 'skipped';

/**
 * The per-cycle idempotency key is the user's LOCAL date ("YYYY-MM-DD"). The
 * column is a DateTime, so we anchor that calendar date at UTC midnight: the
 * value is a pure date key, never a wall-clock instant, so it compares cleanly
 * and the unique (userId, scheduledFor) index gives exactly one nudge per local
 * day. Mirrors ayah's DeliveryLog lock (ayah stores the raw string; we store
 * the same date as a stable DateTime so the column type is honoured).
 */
export function localDateKey(scheduledFor: string): Date {
  return new Date(`${scheduledFor}T00:00:00.000Z`);
}

export type ClaimResult = 'nudged' | 'duplicate';

/**
 * Record that the bot nudged this user for `scheduledFor` (their local date)
 * and stamp lastNudgeAt, all in one transaction. Call this ONLY after the
 * message was actually sent.
 *
 * The unique (userId, scheduledFor) index is the idempotency lock: if a second
 * trigger races in for the same local day, the insert fails with P2002 and we
 * report 'duplicate' without writing a second log or re-stamping lastNudgeAt.
 * Mirrors ayah's commitDelivery.
 */
export async function claimNudge(params: {
  userId: number;
  personId: number | null;
  scheduledFor: string;
  now?: Date;
}): Promise<ClaimResult> {
  const { userId, personId, scheduledFor } = params;
  const now = params.now ?? new Date();

  try {
    await prisma.$transaction([
      prisma.nudgeLog.create({
        data: {
          userId,
          personId,
          action: 'nudged',
          scheduledFor: localDateKey(scheduledFor),
        },
      }),
      prisma.user.update({ where: { id: userId }, data: { lastNudgeAt: now } }),
    ]);
    return 'nudged';
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return 'duplicate';
    throw err;
  }
}

/** True if this user already has a nudge recorded for the given local date. */
export async function hasNudgeFor(userId: number, scheduledFor: string): Promise<boolean> {
  const found = await prisma.nudgeLog.findUnique({
    where: { userId_scheduledFor: { userId, scheduledFor: localDateKey(scheduledFor) } },
    select: { id: true },
  });
  return found !== null;
}

/**
 * Record what the user did about a nudge (contacted / snoozed / skipped). This
 * is history only. We stamp it with the current instant for scheduledFor, which
 * stays clear of the day's "nudged" row (anchored at UTC midnight). The unique
 * (userId, scheduledFor) index still applies to every row, so on the vanishingly
 * rare same-millisecond collision we swallow the P2002 — a missed history line
 * must never bubble up and break the user's action acknowledgement.
 */
export async function logAction(
  userId: number,
  personId: number | null,
  action: NudgeAction,
): Promise<void> {
  try {
    await prisma.nudgeLog.create({
      data: { userId, personId, action, scheduledFor: new Date() },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return;
    throw err;
  }
}

import { prisma } from '../client';

/** Find a user by their Telegram user id, or null if new. */
export function getByTelegramId(telegramId: bigint) {
  return prisma.user.findUnique({ where: { telegramId } });
}

/**
 * Make sure a user row exists for this Telegram user, creating it with the
 * default settings (22:00–08:00 quiet, weekly default cadence) on their first
 * message. Also clears `blocked`, because the user messaging the bot is proof
 * we can reach them again. (Cadence is per relative — see Person.cadenceDays;
 * defaultCadenceDays is only the starting value a new relative inherits.)
 *
 * Uses an upsert so two messages arriving at once from a brand-new user can
 * never race into a duplicate-key error. Returns the user row.
 */
export async function getOrCreateUser(telegramId: bigint, timezone?: string) {
  try {
    return await prisma.user.upsert({
      where: { telegramId },
      // Any interaction proves the user is reachable again.
      update: { blocked: false },
      create: {
        telegramId,
        ...(timezone ? { timezone } : {}),
      },
    });
  } catch (err) {
    // On MySQL, Prisma's upsert is select-then-insert, so two requests for a
    // brand-new user that land at the very same moment can both try to insert
    // and one loses with P2002. The row now exists, so just update it.
    if ((err as { code?: string }).code === 'P2002') {
      return prisma.user.update({ where: { telegramId }, data: { blocked: false } });
    }
    throw err;
  }
}

/** Settings the user can change. All optional; only the given ones are written. */
export interface UserSettings {
  defaultCadenceDays?: number;
  quietStartHour?: number;
  quietEndHour?: number;
  timezone?: string;
}

/** Update one or more of the user's settings in a single write. */
export function updateSettings(userId: number, settings: UserSettings) {
  return prisma.user.update({ where: { id: userId }, data: settings });
}

/**
 * Take or end an indefinite break. While paused the bot sends nothing and the
 * rotation does not advance, so resuming picks up exactly where they left off
 * (mirrors ayah's pause). `paused` on the User row is the single source of
 * truth; isUserAvailable already filters on it.
 */
export function setPaused(userId: number, paused: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { paused } });
}

/**
 * Snooze nudges until a moment in the future ("remind me later").
 * isUserAvailable suppresses nudges while `snoozeUntil` is still ahead of now;
 * once it passes, the next due cycle nudges normally. Pass null to clear a snooze.
 */
export function setSnooze(userId: number, until: Date | null) {
  return prisma.user.update({ where: { id: userId }, data: { snoozeUntil: until } });
}

/**
 * Mark a user as unreachable (they blocked the bot, or a send failed with a
 * 403). Nudge loops skip blocked users. Cleared automatically the next time
 * they message the bot (see getOrCreateUser).
 */
export function setBlocked(userId: number, blocked: boolean) {
  return prisma.user.update({ where: { id: userId }, data: { blocked } });
}

/**
 * Delete the user and ALL their data. The schema cascades from User to people
 * and nudge logs (onDelete: Cascade), so this single delete wipes everything we
 * ever stored about them — the heart of /forget. Returns the number of users
 * actually deleted (0 if they had no row yet).
 */
export async function forgetUser(telegramId: bigint): Promise<number> {
  const result = await prisma.user.deleteMany({ where: { telegramId } });
  return result.count;
}

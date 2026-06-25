import { prisma } from '../client';

/**
 * A snapshot of the bot's reach, for the admin's /admin_stats command. We keep
 * it small and cheap: a few COUNTs the admin glances at, not analytics.
 *
 * `paused` and `blocked` are independent flags on the User row, so a user could
 * in principle be both; `active` is the headline number the admin cares about —
 * users we will actually nudge — defined as NOT paused AND NOT blocked, so the
 * three sub-counts do not have to add up to `total`.
 */
export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  pausedUsers: number;
  blockedUsers: number;
  totalPeople: number;
}

/** Gather the subscriber counts in one round of parallel COUNTs. */
export async function getAdminStats(): Promise<AdminStats> {
  const [totalUsers, pausedUsers, blockedUsers, activeUsers, totalPeople] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { paused: true } }),
    prisma.user.count({ where: { blocked: true } }),
    // The number we actually nudge: reachable and not on a break.
    prisma.user.count({ where: { paused: false, blocked: false } }),
    prisma.person.count(),
  ]);

  return { totalUsers, activeUsers, pausedUsers, blockedUsers, totalPeople };
}

import cron, { type ScheduledTask } from 'node-cron';
import type { Bot, Context } from 'grammy';
import { deliverDueUsers, type NudgeStats } from './lib/deliver';
import { logger } from './lib/logger';

const tasks: ScheduledTask[] = [];

// In-process lock so two nudge BATCHES never overlap. A batch that takes longer
// than a minute would otherwise let the next cron tick (or the startup
// catch-up) start a second batch, and both could nudge the same user before
// either records it. The per-cycle unique index stops a double RECORD; this
// guard stops a double SEND between batches. (Single bot process assumed;
// horizontal scaling would need a database lock instead.)
//
// Note: /now is a second, interactive sender that runs OUTSIDE this lock (it
// claims this cycle's nudge when a user pulls it early). The unique index still
// prevents any double record, so the only residual race is a user running /now
// in the exact sub-second their scheduled nudge fires, which can duplicate one
// message. Benign and near-impossible under the single-process model.
let nudgeRunning = false;

/**
 * Run one nudge batch, unless another is already in progress. Used by both the
 * cron tick and the startup catch-up. Returns null when skipped because a run
 * was already active.
 */
export async function runNudgeOnce(
  bot: Bot<Context>,
  now: Date = new Date(),
): Promise<NudgeStats | null> {
  if (nudgeRunning) {
    logger.debug('Nudge batch already running, skipping this trigger');
    return null;
  }
  nudgeRunning = true;
  try {
    return await deliverDueUsers(bot, now);
  } finally {
    nudgeRunning = false;
  }
}

/**
 * Start the recurring jobs:
 *   - Nudge tick, every minute. Each user is judged in their own timezone, so
 *     one global minute-tick serves every timezone correctly. The (user, local
 *     date) record keeps it to one nudge per cycle.
 *
 * Errors inside a job are caught so a single bad run never kills the loop.
 */
export function startScheduler(bot: Bot<Context>): void {
  const tick = cron.schedule('* * * * *', () => {
    runNudgeOnce(bot)
      .then((stats) => {
        if (stats && stats.due > 0) logger.info('Nudge tick', { ...stats });
      })
      .catch((err) => logger.error('Nudge tick failed', { error: String(err) }));
  });

  tasks.push(tick);
  logger.info('Scheduler started', { jobs: tasks.length });
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
  logger.info('Scheduler stopped');
}

// A tiny in-memory store for "the next plain message is the answer to a prompt"
// flows. There is one such flow — adding a person — reached either from /add
// with no name or from a «من أصِل؟» guide chip. The guide presets the relation
// and cadence; the next plain message is the name. Kept deliberately simple (a
// Map keyed by Telegram user id) — it is a convenience, not state we must not
// lose: if the process restarts the user just re-runs the command. Single
// process only, which matches the bot's single-instance model.

/**
 * A pending "add a person" prompt. `relation`/`cadenceDays` are preset by a
 * guide chip (e.g. عمّي, fortnightly); both null means a plain /add, where the
 * relation is parsed from the message and the cadence falls back to the user's
 * default.
 */
export interface PendingAdd {
  relation: string | null;
  cadenceDays: number | null;
}

const pending = new Map<bigint, PendingAdd>();

/** Remember that this user's next plain message is the name of a person to add,
 *  with any relation/cadence the guide preset. */
export function setPending(telegramId: bigint, add: PendingAdd): void {
  pending.set(telegramId, add);
}

/** Consume (read and clear) the pending add for this user. */
export function takePending(telegramId: bigint): PendingAdd | undefined {
  const add = pending.get(telegramId);
  pending.delete(telegramId);
  return add;
}

/** Drop any pending prompt for this user (e.g. they ran another command). */
export function clearPending(telegramId: bigint): void {
  pending.delete(telegramId);
}

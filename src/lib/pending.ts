// A tiny in-memory store for "the next plain message is the answer to a prompt"
// flows: /add with no name, and /shukr after enabling. Kept deliberately simple
// (a Map keyed by Telegram user id) — it is a convenience, not state we must not
// lose: if the process restarts the user just re-runs the command. Single
// process only, which matches the bot's single-instance model.

export type PendingKind = 'add-name' | 'shukr-text';

const pending = new Map<bigint, PendingKind>();

/** Remember that this user's next plain message answers a given prompt. */
export function setPending(telegramId: bigint, kind: PendingKind): void {
  pending.set(telegramId, kind);
}

/** Consume (read and clear) the pending prompt for this user. */
export function takePending(telegramId: bigint): PendingKind | undefined {
  const kind = pending.get(telegramId);
  pending.delete(telegramId);
  return kind;
}

/** Drop any pending prompt for this user (e.g. they ran another command). */
export function clearPending(telegramId: bigint): void {
  pending.delete(telegramId);
}

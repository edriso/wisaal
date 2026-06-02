// Fair rotation through the user's circle of relatives. Pure: it works over a
// minimal shape, not the Prisma Person type, so it is trivially testable and
// never reaches for a clock or a database.
//
// The rule, in plain words: reach out first to whoever you have NOT contacted
// at all, then to whoever you contacted longest ago. This way every person is
// visited once before anyone is visited twice, which is what "keeping ties
// with ALL of them" should feel like.

/** The few Person fields the rotation actually needs. */
export interface RotationCandidate {
  id: number;
  /** When this person was last marked contacted; null = never contacted. */
  lastContactedAt: Date | null;
  /** When the person was added; the stable tie-breaker before id. */
  createdAt: Date;
}

/**
 * Pick the next person to nudge from `people`.
 *
 * Ordering (most-due first):
 *   1. Anyone never contacted (lastContactedAt == null) ALWAYS comes before
 *      anyone who has been contacted.
 *   2. Among never-contacted, and separately among contacted, the earlier one
 *      is more due: a contacted person is ranked by how long ago (older
 *      lastContactedAt first).
 *   3. Ties break by older createdAt, then by smaller id — both stable so the
 *      result is deterministic for a given list.
 *
 * `now` is accepted for signature symmetry with the rest of core (the caller
 * always passes it); the pick itself does not depend on the current time.
 * Returns null for an empty list.
 */
export function pickNextPerson<T extends RotationCandidate>(
  people: readonly T[],
  _now?: Date,
): T | null {
  // The pick is just the head of the priority order. Sharing one comparator
  // with sortByContactPriority guarantees /list and the nudge agree on who is
  // most due — the list never points somewhere different from the next nudge.
  return sortByContactPriority(people)[0] ?? null;
}

/**
 * Sort `people` most-due first, by the same rules pickNextPerson uses
 * (never-contacted first, then least-recently contacted, then createdAt, then
 * id). Returns a NEW array; the input is never mutated. This is what /list
 * renders, so the browse order and the next-nudge pick are always consistent.
 */
export function sortByContactPriority<T extends RotationCandidate>(people: readonly T[]): T[] {
  return [...people].sort((a, b) => (isMoreDue(a, b) ? -1 : isMoreDue(b, a) ? 1 : 0));
}

/** True when `a` should be nudged before `b` under the rules above. */
function isMoreDue(a: RotationCandidate, b: RotationCandidate): boolean {
  const aNever = a.lastContactedAt === null;
  const bNever = b.lastContactedAt === null;

  // Never-contacted always wins over contacted.
  if (aNever !== bNever) return aNever;

  // Both contacted: the one contacted longer ago is more due.
  if (!aNever && !bNever) {
    const aTime = a.lastContactedAt!.getTime();
    const bTime = b.lastContactedAt!.getTime();
    if (aTime !== bTime) return aTime < bTime;
  }

  // Either both never-contacted, or contacted at the same instant: fall back to
  // the stable tie-breakers so a full pass visits people in a fixed order.
  const aCreated = a.createdAt.getTime();
  const bCreated = b.createdAt.getTime();
  if (aCreated !== bCreated) return aCreated < bCreated;
  return a.id < b.id;
}

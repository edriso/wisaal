import { prisma } from '../client';

/** The Person fields the rotation needs, in the order the picker expects. */
const rotationSelect = {
  id: true,
  name: true,
  relation: true,
  lastContactedAt: true,
  createdAt: true,
} as const;

export type RotationPerson = Awaited<ReturnType<typeof listPeople>>[number];

/**
 * Add a relative to the user's circle. The relation label (e.g. "خالتي") is
 * optional. A brand-new person has lastContactedAt null, so the fair rotation
 * (src/core/rotation.ts) always reaches them before anyone already contacted.
 */
export function addPerson(userId: number, name: string, relation?: string | null) {
  return prisma.person.create({
    data: { userId, name, relation: relation ?? null },
  });
}

/**
 * Every person in the user's circle, oldest-added first so the list reads in a
 * stable order. Scoped to the user so one user can never see another's circle.
 */
export function listPeople(userId: number) {
  return prisma.person.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: rotationSelect,
  });
}

/**
 * Remove a person from the user's circle. The userId is part of the filter so
 * a user can only ever remove their OWN people, never someone else's by id.
 * Returns true if a row was actually deleted. The NudgeLog FK is SetNull, so
 * history rows survive with a null personId.
 */
export async function removePerson(userId: number, personId: number): Promise<boolean> {
  const result = await prisma.person.deleteMany({ where: { id: personId, userId } });
  return result.count > 0;
}

/**
 * Mark a person as contacted right now. This is what advances the fair
 * rotation: setting lastContactedAt to `now` moves them to the back of the
 * queue naturally, since the picker always favours whoever was contacted
 * longest ago. Scoped to userId so one user can't touch another's people.
 * Returns true if a row was updated.
 */
export async function markContacted(
  userId: number,
  personId: number,
  now: Date = new Date(),
): Promise<boolean> {
  const result = await prisma.person.updateMany({
    where: { id: personId, userId },
    data: { lastContactedAt: now },
  });
  return result.count > 0;
}

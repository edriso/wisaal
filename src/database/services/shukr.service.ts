import { prisma } from '../client';

/** The fields the gratitude journal browser shows. */
const shukrSelect = { id: true, text: true, createdAt: true } as const;

export type ShukrListEntry = Awaited<ReturnType<typeof listShukr>>[number];

/**
 * Save a one-line gratitude note for the user. The optional shukr journal is
 * purely additive and encouraging; entries are never surfaced as pressure.
 */
export function addShukr(userId: number, text: string) {
  return prisma.shukrEntry.create({ data: { userId, text } });
}

/**
 * The user's gratitude notes, most recent first, so the journal opens on what
 * they last recorded. Scoped to the user so one user never sees another's.
 */
export function listShukr(userId: number) {
  return prisma.shukrEntry.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: shukrSelect,
  });
}

/**
 * Delete one gratitude note. The userId is part of the filter so a user can
 * only ever remove their OWN entry, never someone else's by id. Returns true if
 * a row was actually deleted.
 */
export async function removeShukr(userId: number, entryId: number): Promise<boolean> {
  const result = await prisma.shukrEntry.deleteMany({ where: { id: entryId, userId } });
  return result.count > 0;
}

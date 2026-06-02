import { prisma } from '../client';

/**
 * Save a one-line gratitude note for the user. The optional shukr journal is
 * purely additive and encouraging; entries are never surfaced as pressure.
 */
export function addShukr(userId: number, text: string) {
  return prisma.shukrEntry.create({ data: { userId, text } });
}

/** How many gratitude notes the user has recorded (for a gentle count). */
export function countShukr(userId: number): Promise<number> {
  return prisma.shukrEntry.count({ where: { userId } });
}

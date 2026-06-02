import { describe, it, expect } from 'vitest';
import { pickNextPerson, type RotationCandidate } from './rotation';

// Small helper to build a candidate tersely. createdAt defaults to a fixed
// epoch so tests that don't care about it stay readable.
function person(
  id: number,
  lastContactedAt: Date | null,
  createdAt = new Date('2026-01-01T00:00:00Z'),
): RotationCandidate {
  return { id, lastContactedAt, createdAt };
}

const D = (iso: string) => new Date(iso);

describe('pickNextPerson', () => {
  it('returns null for an empty list', () => {
    expect(pickNextPerson([])).toBeNull();
  });

  it('returns the only person in a one-person list', () => {
    const p = person(1, null);
    expect(pickNextPerson([p])).toBe(p);
  });

  it('always picks a never-contacted person before any contacted one', () => {
    const contactedLongAgo = person(1, D('2020-01-01T00:00:00Z'));
    const neverContacted = person(2, null);
    expect(pickNextPerson([contactedLongAgo, neverContacted])?.id).toBe(2);
    // Order in the input must not matter.
    expect(pickNextPerson([neverContacted, contactedLongAgo])?.id).toBe(2);
  });

  it('among contacted people, picks the least-recently contacted', () => {
    const recent = person(1, D('2026-05-30T00:00:00Z'));
    const oldest = person(2, D('2026-01-15T00:00:00Z'));
    const middle = person(3, D('2026-03-01T00:00:00Z'));
    expect(pickNextPerson([recent, oldest, middle])?.id).toBe(2);
  });

  it('breaks a tie among never-contacted by older createdAt', () => {
    const a = person(1, null, D('2026-02-01T00:00:00Z'));
    const b = person(2, null, D('2026-01-01T00:00:00Z')); // added earlier
    expect(pickNextPerson([a, b])?.id).toBe(2);
  });

  it('breaks a tie among equally-contacted by older createdAt', () => {
    const t = D('2026-04-01T00:00:00Z');
    const a = person(1, t, D('2026-02-01T00:00:00Z'));
    const b = person(2, t, D('2026-01-01T00:00:00Z'));
    expect(pickNextPerson([a, b])?.id).toBe(2);
  });

  it('breaks a full tie (same lastContacted and createdAt) by smaller id', () => {
    const t = D('2026-04-01T00:00:00Z');
    const created = D('2026-01-01T00:00:00Z');
    const a = person(7, t, created);
    const b = person(3, t, created);
    expect(pickNextPerson([a, b])?.id).toBe(3);
  });

  // The defining property: simulate the real loop — pick someone, mark them
  // contacted "now", advance the clock — and confirm a full rotation visits
  // every person exactly once before anyone repeats.
  it('a full rotation visits everyone once before repeating', () => {
    const people: RotationCandidate[] = [
      person(1, null, D('2026-01-01T00:00:00Z')),
      person(2, null, D('2026-01-02T00:00:00Z')),
      person(3, null, D('2026-01-03T00:00:00Z')),
      person(4, null, D('2026-01-04T00:00:00Z')),
    ];

    const visited: number[] = [];
    let clock = D('2026-06-01T09:00:00Z').getTime();

    for (let step = 0; step < people.length * 2; step++) {
      const next = pickNextPerson(people, new Date(clock))!;
      visited.push(next.id);
      next.lastContactedAt = new Date(clock); // mark contacted
      clock += 86_400_000; // a day passes before the next pick
    }

    const firstPass = visited.slice(0, 4).sort((a, b) => a - b);
    const secondPass = visited.slice(4).sort((a, b) => a - b);
    // Each pass is a permutation of all four people: no one is skipped or
    // repeated within a pass.
    expect(firstPass).toEqual([1, 2, 3, 4]);
    expect(secondPass).toEqual([1, 2, 3, 4]);
  });

  it('does not mutate the input list', () => {
    const list = [person(1, D('2026-05-01T00:00:00Z')), person(2, null)];
    const copy = [...list];
    pickNextPerson(list);
    expect(list).toEqual(copy);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Prisma client so the test needs no database. The client module
// connects a pool at import, so we replace it wholesale with count() stubs.
const h = vi.hoisted(() => ({
  userCount: vi.fn(),
  personCount: vi.fn(),
}));

vi.mock('../client', () => ({
  prisma: {
    user: { count: h.userCount },
    person: { count: h.personCount },
  },
}));

import { getAdminStats } from './stats.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAdminStats', () => {
  it('reports each count and queries active as not-paused AND not-blocked', async () => {
    // user.count is called 4 times, in order: total, paused, blocked, active.
    h.userCount
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(3) // paused
      .mockResolvedValueOnce(2) // blocked
      .mockResolvedValueOnce(6); // active (not paused, not blocked)
    h.personCount.mockResolvedValue(42);

    const stats = await getAdminStats();

    expect(stats).toEqual({
      totalUsers: 10,
      activeUsers: 6,
      pausedUsers: 3,
      blockedUsers: 2,
      totalPeople: 42,
    });

    // The "active" count must filter on BOTH flags, not just one — that is the
    // headline number the admin trusts, so lock its where-clause.
    expect(h.userCount).toHaveBeenCalledWith({ where: { paused: false, blocked: false } });
    expect(h.userCount).toHaveBeenCalledWith({ where: { paused: true } });
    expect(h.userCount).toHaveBeenCalledWith({ where: { blocked: true } });
  });

  it('handles a fresh, empty install (all zeros)', async () => {
    h.userCount.mockResolvedValue(0);
    h.personCount.mockResolvedValue(0);

    const stats = await getAdminStats();

    expect(stats).toEqual({
      totalUsers: 0,
      activeUsers: 0,
      pausedUsers: 0,
      blockedUsers: 0,
      totalPeople: 0,
    });
  });
});

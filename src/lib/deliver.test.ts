import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub the database and send layers so deliverDueUsers can be tested with no
// real database. The eligibility/rotation math and the message formatting are
// the real implementations.
const h = vi.hoisted(() => ({
  findMany: vi.fn(),
  hasNudgeFor: vi.fn(),
  listPeople: vi.fn(),
  claimNudge: vi.fn(),
  setBlocked: vi.fn(),
  sendMessage: vi.fn(),
}));

vi.mock('../database', () => ({
  prisma: { user: { findMany: h.findMany } },
  hasNudgeFor: h.hasNudgeFor,
  listPeople: h.listPeople,
  claimNudge: h.claimNudge,
  setBlocked: h.setBlocked,
}));
vi.mock('./send', () => ({ sendMessage: h.sendMessage }));
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { deliverDueUsers, buildNudgeView } from './deliver';

// A fixed midday instant so the user (Africa/Cairo, default 22→08 quiet window)
// is comfortably outside quiet hours and a never-nudged user is due.
const NOW = new Date('2026-06-02T10:00:00Z');

function dueUser(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    telegramId: 111n,
    timezone: 'Africa/Cairo',
    cadenceDays: 3,
    quietStartHour: 22,
    quietEndHour: 8,
    snoozeUntil: null,
    paused: false,
    blocked: false,
    lastNudgeAt: null, // never nudged -> due
    ...over,
  };
}

const PEOPLE = [
  {
    id: 10,
    name: 'فاطمة',
    relation: 'خالتي',
    lastContactedAt: null,
    createdAt: new Date('2026-01-01'),
  },
];

// A minimal fake bot; sendMessage is mocked so it is never really called.
const bot = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.hasNudgeFor.mockResolvedValue(false);
  h.listPeople.mockResolvedValue(PEOPLE);
  h.claimNudge.mockResolvedValue('nudged');
  h.sendMessage.mockResolvedValue('ok');
});

describe('deliverDueUsers', () => {
  it('sends to a due user and claims via the unique lock (lastNudgeAt set by claimNudge)', async () => {
    h.findMany.mockResolvedValue([dueUser()]);
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.sendMessage).toHaveBeenCalledTimes(1);
    // The claim records the nudge and advances lastNudgeAt, ONLY after the send.
    expect(h.claimNudge).toHaveBeenCalledTimes(1);
    expect(h.claimNudge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, personId: 10, now: NOW }),
    );
    expect(stats).toMatchObject({ due: 1, sent: 1, failed: 0 });
  });

  it('is a no-op the second run in the same cycle (the hasNudgeFor lock)', async () => {
    h.findMany.mockResolvedValue([dueUser()]);
    h.hasNudgeFor.mockResolvedValue(true); // already nudged this local day
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(h.claimNudge).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ due: 1, sent: 0, skipped: 1 });
  });

  it('does NOT claim/advance when the send fails (retried next tick)', async () => {
    h.findMany.mockResolvedValue([dueUser()]);
    h.sendMessage.mockResolvedValue('failed');
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.claimNudge).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ due: 1, sent: 0, failed: 1 });
  });

  it('marks a user blocked on a 403 and does not claim', async () => {
    h.findMany.mockResolvedValue([dueUser()]);
    h.sendMessage.mockResolvedValue('blocked');
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.setBlocked).toHaveBeenCalledWith(1, true);
    expect(h.claimNudge).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ failed: 1 });
  });

  it('skips a not-due user (snoozed) without counting them due', async () => {
    const snoozed = dueUser({ snoozeUntil: new Date('2026-06-03T00:00:00Z') });
    h.findMany.mockResolvedValue([snoozed]);
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ due: 0, sent: 0 });
  });

  it('skips a due user with an empty circle', async () => {
    h.findMany.mockResolvedValue([dueUser()]);
    h.listPeople.mockResolvedValue([]);
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.sendMessage).not.toHaveBeenCalled();
    expect(stats).toMatchObject({ due: 1, sent: 0, skipped: 1 });
  });

  it('one user throwing does not stop the others', async () => {
    const bad = dueUser({ id: 1, telegramId: 111n });
    const good = dueUser({ id: 2, telegramId: 222n });
    h.findMany.mockResolvedValue([bad, good]);
    // Fail the first user's send hard; the second must still go through.
    h.sendMessage.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const stats = await deliverDueUsers(bot, NOW);

    expect(h.sendMessage).toHaveBeenCalledTimes(2);
    expect(h.claimNudge).toHaveBeenCalledTimes(1); // only the good user claimed
    expect(stats).toMatchObject({ due: 2, sent: 1, failed: 1 });
  });
});

describe('buildNudgeView', () => {
  it('returns an empty view (no claim) for an empty circle', async () => {
    const view = await buildNudgeView(dueUser(), [], NOW);
    expect(view.message).toBeNull();
    expect(view.claim).toBeNull();
  });

  it('picks the next person and claims when claimable and not yet nudged', async () => {
    h.hasNudgeFor.mockResolvedValue(false);
    const view = await buildNudgeView(dueUser(), PEOPLE, NOW, { claimable: true });
    expect(view.person?.id).toBe(10);
    expect(view.message).toContain('خالتي فاطمة');
    expect(view.claim).toMatchObject({ personId: 10 });
    expect(view.alreadyNudged).toBe(false);
  });

  it('re-shows without a claim when already nudged this local day', async () => {
    h.hasNudgeFor.mockResolvedValue(true);
    const view = await buildNudgeView(dueUser(), PEOPLE, NOW, { claimable: true });
    expect(view.message).not.toBeNull();
    expect(view.claim).toBeNull();
    expect(view.alreadyNudged).toBe(true);
  });
});

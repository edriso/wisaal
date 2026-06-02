import { describe, it, expect } from 'vitest';
import { isNudgeDue, isQuietHour, type EligibilityUser } from './eligibility';

// A baseline user: every 3 days, quiet 22:00–08:00, in Cairo (UTC+2, no DST in
// the years tested). Tests override only the fields they care about.
function user(overrides: Partial<EligibilityUser> = {}): EligibilityUser {
  return {
    timezone: 'Africa/Cairo',
    cadenceDays: 3,
    quietStartHour: 22,
    quietEndHour: 8,
    snoozeUntil: null,
    paused: false,
    blocked: false,
    ...overrides,
  };
}

describe('isQuietHour', () => {
  it('handles a same-day window [start, end)', () => {
    // Quiet 0..6 → 00:00–05:59.
    expect(isQuietHour(0, 0, 6)).toBe(true);
    expect(isQuietHour(5, 0, 6)).toBe(true);
    expect(isQuietHour(6, 0, 6)).toBe(false); // end is exclusive
    expect(isQuietHour(12, 0, 6)).toBe(false);
  });

  it('wraps past midnight for a 22..8 window', () => {
    expect(isQuietHour(22, 22, 8)).toBe(true); // start is inclusive
    expect(isQuietHour(23, 22, 8)).toBe(true);
    expect(isQuietHour(0, 22, 8)).toBe(true);
    expect(isQuietHour(7, 22, 8)).toBe(true);
    expect(isQuietHour(8, 22, 8)).toBe(false); // end is exclusive
    expect(isQuietHour(9, 22, 8)).toBe(false);
    expect(isQuietHour(21, 22, 8)).toBe(false);
  });

  it('treats an empty window (start == end) as never quiet', () => {
    for (let h = 0; h < 24; h++) expect(isQuietHour(h, 9, 9)).toBe(false);
  });
});

describe('isNudgeDue — gating flags', () => {
  it('is not due when paused', () => {
    const now = new Date('2026-06-02T10:00:00Z'); // 12:00 Cairo, awake
    expect(isNudgeDue({ now, user: user({ paused: true }), lastNudgeAt: null })).toBe(false);
  });

  it('is not due when blocked', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    expect(isNudgeDue({ now, user: user({ blocked: true }), lastNudgeAt: null })).toBe(false);
  });

  it('is not due while a future snooze is active', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    const snoozeUntil = new Date('2026-06-02T12:00:00Z'); // later than now
    expect(isNudgeDue({ now, user: user({ snoozeUntil }), lastNudgeAt: null })).toBe(false);
  });

  it('is due once a past snooze has elapsed', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    const snoozeUntil = new Date('2026-06-02T08:00:00Z'); // already passed
    expect(isNudgeDue({ now, user: user({ snoozeUntil }), lastNudgeAt: null })).toBe(true);
  });
});

describe('isNudgeDue — quiet hours (in the user timezone)', () => {
  it('is not due during the local quiet window', () => {
    // 00:00 UTC = 02:00 Cairo, inside the 22..8 quiet window.
    const now = new Date('2026-06-02T00:00:00Z');
    expect(isNudgeDue({ now, user: user(), lastNudgeAt: null })).toBe(false);
  });

  it('is due just after the quiet window ends locally', () => {
    // 06:00 UTC = 08:00 Cairo, the first awake hour (end is exclusive).
    const now = new Date('2026-06-02T06:00:00Z');
    expect(isNudgeDue({ now, user: user(), lastNudgeAt: null })).toBe(true);
  });

  it('is not due at the first quiet hour boundary (start inclusive)', () => {
    // 20:00 UTC = 22:00 Cairo, the start of quiet.
    const now = new Date('2026-06-02T20:00:00Z');
    expect(isNudgeDue({ now, user: user(), lastNudgeAt: null })).toBe(false);
  });
});

describe('isNudgeDue — cadence', () => {
  // Pick an awake local hour for all cadence cases: 10:00 UTC = 12:00 Cairo.
  const awake = (day: string) => new Date(`2026-06-${day}T10:00:00Z`);

  it('is due when never nudged before (and awake)', () => {
    expect(isNudgeDue({ now: awake('02'), user: user(), lastNudgeAt: null })).toBe(true);
  });

  it('is not due before cadenceDays whole days have passed', () => {
    const last = awake('02');
    // 2 local days later, cadence is 3 → not yet.
    expect(isNudgeDue({ now: awake('04'), user: user(), lastNudgeAt: last })).toBe(false);
  });

  it('is due exactly at the cadence boundary (N days)', () => {
    const last = awake('02');
    // 3 local days later, cadence is 3 → due (boundary inclusive).
    expect(isNudgeDue({ now: awake('05'), user: user(), lastNudgeAt: last })).toBe(true);
  });

  it('is due past the cadence boundary', () => {
    const last = awake('02');
    expect(isNudgeDue({ now: awake('10'), user: user(), lastNudgeAt: last })).toBe(true);
  });

  it('honours a daily cadence (1 day)', () => {
    const u = user({ cadenceDays: 1 });
    const last = awake('02');
    expect(isNudgeDue({ now: awake('02'), user: u, lastNudgeAt: last })).toBe(false); // same day
    expect(isNudgeDue({ now: awake('03'), user: u, lastNudgeAt: last })).toBe(true); // next day
  });

  it('counts cadence by LOCAL calendar dates, not raw 24h spans', () => {
    // Last nudge late on the 2nd Cairo time, "now" early on the 5th Cairo time.
    // 21:00 UTC on the 1st = 23:00 Cairo on the 1st... use clearer instants:
    // last: 22:00 UTC 02 = 00:00 Cairo 03. now: 07:00 UTC 06 = 09:00 Cairo 06.
    const last = new Date('2026-06-02T22:00:00Z'); // Cairo: 2026-06-03
    const now = new Date('2026-06-06T07:00:00Z'); // Cairo: 2026-06-06, 09:00
    // Local dates differ by 3 → due with cadence 3.
    expect(isNudgeDue({ now, user: user(), lastNudgeAt: last })).toBe(true);
  });
});

describe('isNudgeDue — a non-UTC, half-hour-offset timezone via the kit', () => {
  // Asia/Kolkata is UTC+5:30 and never observes DST, a good stress test for
  // the timezone math coming from getLocalContext.
  const tz = 'Asia/Kolkata';

  it('respects local quiet hours in Kolkata', () => {
    const u = user({ timezone: tz, quietStartHour: 22, quietEndHour: 7 });
    // 18:00 UTC = 23:30 Kolkata → quiet.
    expect(isNudgeDue({ now: new Date('2026-06-02T18:00:00Z'), user: u, lastNudgeAt: null })).toBe(
      false,
    );
    // 06:00 UTC = 11:30 Kolkata → awake.
    expect(isNudgeDue({ now: new Date('2026-06-02T06:00:00Z'), user: u, lastNudgeAt: null })).toBe(
      true,
    );
  });
});

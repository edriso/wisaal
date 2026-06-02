import { describe, it, expect } from 'vitest';
import {
  isPersonDue,
  isQuietHour,
  isUserAvailable,
  type DueCandidate,
  type EligibilityUser,
} from './eligibility';

// A baseline user: quiet 22:00–08:00, in Cairo (UTC+2, no DST in the years
// tested). Tests override only the fields they care about.
function user(overrides: Partial<EligibilityUser> = {}): EligibilityUser {
  return {
    timezone: 'Africa/Cairo',
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

describe('isUserAvailable — gating flags', () => {
  it('is not available when paused', () => {
    const now = new Date('2026-06-02T10:00:00Z'); // 12:00 Cairo, awake
    expect(isUserAvailable({ now, user: user({ paused: true }) })).toBe(false);
  });

  it('is not available when blocked', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    expect(isUserAvailable({ now, user: user({ blocked: true }) })).toBe(false);
  });

  it('is not available while a future snooze is active', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    const snoozeUntil = new Date('2026-06-02T12:00:00Z'); // later than now
    expect(isUserAvailable({ now, user: user({ snoozeUntil }) })).toBe(false);
  });

  it('is available once a past snooze has elapsed', () => {
    const now = new Date('2026-06-02T10:00:00Z');
    const snoozeUntil = new Date('2026-06-02T08:00:00Z'); // already passed
    expect(isUserAvailable({ now, user: user({ snoozeUntil }) })).toBe(true);
  });
});

describe('isUserAvailable — quiet hours (in the user timezone)', () => {
  it('is not available during the local quiet window', () => {
    // 00:00 UTC = 02:00 Cairo, inside the 22..8 quiet window.
    const now = new Date('2026-06-02T00:00:00Z');
    expect(isUserAvailable({ now, user: user() })).toBe(false);
  });

  it('is available just after the quiet window ends locally', () => {
    // 06:00 UTC = 08:00 Cairo, the first awake hour (end is exclusive).
    const now = new Date('2026-06-02T06:00:00Z');
    expect(isUserAvailable({ now, user: user() })).toBe(true);
  });

  it('is not available at the first quiet hour boundary (start inclusive)', () => {
    // 20:00 UTC = 22:00 Cairo, the start of quiet.
    const now = new Date('2026-06-02T20:00:00Z');
    expect(isUserAvailable({ now, user: user() })).toBe(false);
  });

  it('respects local quiet hours in a non-UTC, half-hour-offset zone', () => {
    // Asia/Kolkata is UTC+5:30 and never observes DST — a good stress test for
    // the timezone math coming from getLocalContext.
    const u = user({ timezone: 'Asia/Kolkata', quietStartHour: 22, quietEndHour: 7 });
    // 18:00 UTC = 23:30 Kolkata → quiet.
    expect(isUserAvailable({ now: new Date('2026-06-02T18:00:00Z'), user: u })).toBe(false);
    // 06:00 UTC = 11:30 Kolkata → awake.
    expect(isUserAvailable({ now: new Date('2026-06-02T06:00:00Z'), user: u })).toBe(true);
  });
});

describe('isPersonDue — per-relative cadence (in the user timezone)', () => {
  const tz = 'Africa/Cairo';
  // An awake-or-not, the due check ignores quiet hours: it is pure date math.
  const at = (day: string) => new Date(`2026-06-${day}T10:00:00Z`);
  const person = (overrides: Partial<DueCandidate> = {}): DueCandidate => ({
    cadenceDays: 7,
    lastContactedAt: null,
    ...overrides,
  });

  it('is always due when never contacted', () => {
    expect(isPersonDue({ now: at('02'), timezone: tz, person: person() })).toBe(true);
  });

  it('is not due before cadenceDays whole days have passed', () => {
    const p = person({ cadenceDays: 7, lastContactedAt: at('02') });
    expect(isPersonDue({ now: at('05'), timezone: tz, person: p })).toBe(false); // 3 < 7
    expect(isPersonDue({ now: at('08'), timezone: tz, person: p })).toBe(false); // 6 < 7
  });

  it('is due exactly at the cadence boundary (N days), boundary inclusive', () => {
    const p = person({ cadenceDays: 7, lastContactedAt: at('02') });
    expect(isPersonDue({ now: at('09'), timezone: tz, person: p })).toBe(true); // 7 == 7
  });

  it('is due past the cadence boundary', () => {
    const p = person({ cadenceDays: 7, lastContactedAt: at('02') });
    expect(isPersonDue({ now: at('20'), timezone: tz, person: p })).toBe(true);
  });

  it('honours a daily cadence (1 day)', () => {
    const p = person({ cadenceDays: 1, lastContactedAt: at('02') });
    expect(isPersonDue({ now: at('02'), timezone: tz, person: p })).toBe(false); // same day
    expect(isPersonDue({ now: at('03'), timezone: tz, person: p })).toBe(true); // next day
  });

  it('honours a monthly cadence (30 days)', () => {
    const last = new Date('2026-06-02T10:00:00Z');
    const p = person({ cadenceDays: 30, lastContactedAt: last });
    expect(isPersonDue({ now: new Date('2026-06-25T10:00:00Z'), timezone: tz, person: p })).toBe(
      false,
    );
    expect(isPersonDue({ now: new Date('2026-07-02T10:00:00Z'), timezone: tz, person: p })).toBe(
      true,
    );
  });

  it('counts cadence by LOCAL calendar dates, not raw 24h spans', () => {
    // last: 22:00 UTC 02 = 00:00 Cairo 03. now: 07:00 UTC 06 = 09:00 Cairo 06.
    // Local dates differ by 3, so a 3-day cadence is due.
    const p = person({ cadenceDays: 3, lastContactedAt: new Date('2026-06-02T22:00:00Z') });
    expect(isPersonDue({ now: new Date('2026-06-06T07:00:00Z'), timezone: tz, person: p })).toBe(
      true,
    );
  });
});

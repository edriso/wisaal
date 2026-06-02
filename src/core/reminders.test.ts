import { describe, it, expect } from 'vitest';
import { pickReminder } from './reminders';
import { reminders } from '../database/reference/reminders';

describe('pickReminder', () => {
  it('returns an entry from the reminder list', () => {
    const r = pickReminder(new Date('2026-06-02T09:00:00Z'));
    expect(reminders).toContain(r);
  });

  it('is stable within the same UTC day', () => {
    const morning = pickReminder(new Date('2026-06-02T06:00:00Z'));
    const evening = pickReminder(new Date('2026-06-02T20:00:00Z'));
    expect(morning).toBe(evening);
  });

  it('walks the list day to day', () => {
    const day1 = pickReminder(new Date('2026-06-02T09:00:00Z'));
    const day2 = pickReminder(new Date('2026-06-03T09:00:00Z'));
    expect(day1).not.toBe(day2);
  });

  it('honours an explicit index, taken modulo the list length', () => {
    expect(pickReminder(new Date(), 0)).toBe(reminders[0]);
    expect(pickReminder(new Date(), reminders.length)).toBe(reminders[0]);
    expect(pickReminder(new Date(), 3)).toBe(reminders[3]);
  });

  it('handles a negative index safely', () => {
    expect(pickReminder(new Date(), -1)).toBe(reminders[reminders.length - 1]);
  });

  it('cycles through every reminder over consecutive days', () => {
    const seen = new Set();
    const base = Date.UTC(2026, 0, 1); // a known UTC midnight
    for (let d = 0; d < reminders.length; d++) {
      seen.add(pickReminder(new Date(base + d * 86_400_000)));
    }
    expect(seen.size).toBe(reminders.length);
  });
});

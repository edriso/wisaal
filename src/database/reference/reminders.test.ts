import { describe, it, expect } from 'vitest';
import { reminders } from './reminders';

// Telegram rejects a text message longer than this many UTF-16 code units.
const TELEGRAM_TEXT_LIMIT = 4096;

describe('reminders content', () => {
  it('has at least 10 entries', () => {
    expect(reminders.length).toBeGreaterThanOrEqual(10);
  });

  it('has no duplicate text', () => {
    const texts = reminders.map((r) => r.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('keeps every text well within Telegram’s message limit', () => {
    for (const r of reminders) {
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.text.length).toBeLessThanOrEqual(TELEGRAM_TEXT_LIMIT);
    }
  });

  it('attributes the first seven (hadith / ayah) with a non-null source', () => {
    for (let i = 0; i < 7; i++) {
      expect(reminders[i].source, `reminder #${i + 1} should carry a source`).not.toBeNull();
      expect(reminders[i].source!.length).toBeGreaterThan(0);
    }
  });

  it('leaves the soft nudges (entries 8–10) source-less', () => {
    for (let i = 7; i < reminders.length; i++) {
      expect(reminders[i].source).toBeNull();
    }
  });
});

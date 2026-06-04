import { describe, it, expect } from 'vitest';
import {
  nudgeMessage,
  personLabel,
  cadenceSummaryAr,
  settingsSummary,
  shortDateAr,
  shukrPreview,
  lastContactedAr,
  lastContactedCompactAr,
  COPY,
} from './copy';
import type { Reminder } from '../database/reference/reminders';

const withSource: Reminder = { text: 'متن التذكير.', source: 'البخاري ٠' };
const noSource: Reminder = { text: 'تذكير لطيف.', source: null };

describe('personLabel', () => {
  it('joins a relation with the name', () => {
    expect(personLabel('فاطمة', 'خالتي')).toBe('خالتي فاطمة');
  });

  it('uses the bare name when there is no relation', () => {
    expect(personLabel('فاطمة')).toBe('فاطمة');
    expect(personLabel('فاطمة', null)).toBe('فاطمة');
  });
});

describe('cadenceSummaryAr', () => {
  it('reads the natural spans specially (daily, two-day, weekly, fortnightly, monthly)', () => {
    expect(cadenceSummaryAr(1)).toBe('كل يوم');
    expect(cadenceSummaryAr(2)).toBe('كل يومين');
    expect(cadenceSummaryAr(7)).toBe('كل أسبوع');
    expect(cadenceSummaryAr(14)).toBe('كل أسبوعين');
    expect(cadenceSummaryAr(30)).toBe('كل شهر');
  });

  it('falls back to a counted-days phrase otherwise', () => {
    expect(cadenceSummaryAr(3)).toContain('أيام');
    expect(cadenceSummaryAr(11)).toContain('يومًا');
  });
});

describe('nudgeMessage', () => {
  it('includes the person and the reminder text', () => {
    const msg = nudgeMessage('خالتي فاطمة', noSource);
    expect(msg).toContain('خالتي فاطمة');
    expect(msg).toContain('تذكير لطيف.');
  });

  it('appends the source when the reminder has one', () => {
    const msg = nudgeMessage('أخي', withSource);
    expect(msg).toContain('البخاري ٠');
  });

  it('omits any source line when the reminder has none', () => {
    const msg = nudgeMessage('أخي', noSource);
    expect(msg).not.toContain('البخاري');
  });

  it('stays plain text well under Telegram’s limit', () => {
    const msg = nudgeMessage('أخي', withSource);
    expect(msg.length).toBeLessThanOrEqual(4096);
  });
});

describe('settingsSummary', () => {
  const base = {
    defaultCadenceDays: 30,
    quietStartHour: 22,
    quietEndHour: 8,
    timezone: 'Africa/Cairo',
    paused: false,
  };

  it('shows the default cadence new relatives inherit', () => {
    const summary = settingsSummary(base);
    expect(summary).toContain('كل شهر'); // 30 days = monthly
    expect(summary).toContain('/list'); // points at where each relative is tuned
  });

  it('notes a paused state only when paused', () => {
    expect(settingsSummary(base)).not.toContain('متوقفة');
    expect(settingsSummary({ ...base, paused: true })).toContain('متوقفة');
  });
});

describe('shortDateAr', () => {
  it('formats the local date in Arabic-Indic digits, padded', () => {
    // 10:00 UTC on 2026-06-03 is still 2026-06-03 in Cairo (UTC+2).
    const out = shortDateAr(new Date('2026-06-03T10:00:00Z'), 'Africa/Cairo');
    expect(out).toContain('٢٠٢٦/٠٦/٠٣'); // zeros preserved, slashes between parts
  });
});

describe('shukrPreview', () => {
  it('keeps a short note as-is (collapsing whitespace)', () => {
    expect(shukrPreview('  وصلتُ   خالتي  ')).toBe('وصلتُ خالتي');
  });

  it('truncates a long note with an ellipsis', () => {
    const long = 'ا'.repeat(50);
    const out = shukrPreview(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(30);
  });
});

describe('lastContacted phrasing (in the user timezone)', () => {
  // Africa/Cairo is UTC+2 with no DST, so local-day math is easy to reason about.
  const tz = 'Africa/Cairo';
  const now = new Date('2026-06-04T10:00:00Z'); // Cairo date 2026-06-04

  it('uses single words for the recent days (today / yesterday / day-before)', () => {
    // The detail-card value reads as a bare value after the "آخر تواصل:" label.
    expect(lastContactedAr(new Date('2026-06-04T06:00:00Z'), tz, now)).toBe('اليوم');
    expect(lastContactedAr(new Date('2026-06-03T10:00:00Z'), tz, now)).toBe('أمس');
    expect(lastContactedAr(new Date('2026-06-02T10:00:00Z'), tz, now)).toBe('أول أمس');
  });

  it('falls back to a counted "قبل N" phrase beyond two days', () => {
    expect(lastContactedAr(new Date('2026-05-30T10:00:00Z'), tz, now)).toBe('قبل ٥ أيام');
    expect(lastContactedAr(new Date('2026-05-20T10:00:00Z'), tz, now)).toBe('قبل ١٥ يومًا');
  });

  it('words the never case for its slot (a value on the card, a sentence on the button)', () => {
    expect(lastContactedAr(null, tz, now)).toBe(COPY.lastContactedNeverCard);
    expect(lastContactedCompactAr(null, tz, now)).toBe(COPY.lastContactedNever);
  });

  it('shares the same recent-day words between the card and the button', () => {
    const at = new Date('2026-06-03T10:00:00Z');
    expect(lastContactedCompactAr(at, tz, now)).toBe('أمس');
    expect(lastContactedCompactAr(at, tz, now)).toBe(lastContactedAr(at, tz, now));
  });
});

describe('acknowledgements are warm, never guilt', () => {
  it('exists for contacted / snoozed / skipped', () => {
    expect(COPY.contacted.length).toBeGreaterThan(0);
    expect(COPY.snoozed.length).toBeGreaterThan(0);
    expect(COPY.skipped.length).toBeGreaterThan(0);
  });
});

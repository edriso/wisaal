import { describe, it, expect } from 'vitest';
import { nudgeMessage, personLabel, cadenceSummaryAr, COPY } from './copy';
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
  it('reads daily, two-day, and weekly specially', () => {
    expect(cadenceSummaryAr(1)).toBe('كل يوم');
    expect(cadenceSummaryAr(2)).toBe('كل يومين');
    expect(cadenceSummaryAr(7)).toBe('كل أسبوع');
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

describe('acknowledgements are warm, never guilt', () => {
  it('exists for contacted / snoozed / skipped', () => {
    expect(COPY.contacted.length).toBeGreaterThan(0);
    expect(COPY.snoozed.length).toBeGreaterThan(0);
    expect(COPY.skipped.length).toBeGreaterThan(0);
  });
});

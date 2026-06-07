import { InlineKeyboard } from 'grammy';
import { COPY, cadenceSummaryAr, personLabel, lastContactedCompactAr } from './copy';
import type { RotationPerson } from '../database';

// ─── Callback-data namespaces ───────────────────────────────────────
// Every prefix is namespaced with "tw:" so the patterns never clash and a
// handler can match its own buttons with a tight regex.

// Nudge action buttons. The personId is appended so the handler knows which
// relative the user acted on, e.g. "tw:act:contacted:42".
export const ACTION_PREFIX = 'tw:act:';
export const ACTION_CONTACTED = 'contacted';
export const ACTION_SNOOZE = 'snooze';
export const ACTION_SKIP = 'skip';

// Remove-person buttons, e.g. "tw:rm:42".
export const REMOVE_PREFIX = 'tw:rm:';

// The interactive /list browser. A page button carries the page number,
// e.g. "tw:list:2"; a person button carries the person id, e.g.
// "tw:person:42". Both stay tiny, well inside Telegram's 64-byte limit.
export const LIST_PAGE_PREFIX = 'tw:list:';
export const PERSON_PREFIX = 'tw:person:';
// Marking contacted from the detail card. It runs the SAME markContacted +
// logAction('contacted') as the nudge button, but its own callback lets the
// handler render the detail-flavoured ack (with a back-to-list button) instead
// of the nudge reply — and it deliberately does NOT claim a nudge cycle.
export const PERSON_CONTACTED_PREFIX = 'tw:pcontact:';
// At most this many person-buttons per page; more spills onto further pages.
export const PAGE_SIZE = 8;

// Per-relative cadence, edited from a person's detail card in /list. Opening
// the picker carries the person id, e.g. "tw:pcad:42"; choosing an option
// carries the id and the new cadence, e.g. "tw:pcadset:42:7". Both stay well
// inside Telegram's 64-byte limit.
export const PERSON_CADENCE_PREFIX = 'tw:pcad:';
export const PERSON_CADENCE_SET_PREFIX = 'tw:pcadset:';
// The per-user DEFAULT cadence picker, opened from /settings. Opening is
// "tw:dcad:open"; choosing an option is "tw:dcad:7". It sets the starting
// cadence new relatives inherit; existing relatives are unaffected.
export const DEFAULT_CADENCE_PREFIX = 'tw:dcad:';
// The cadence options offered, in whole days: daily, every 3 days, weekly,
// fortnightly, monthly. Weekly is the default for a new relative.
export const CADENCE_OPTIONS = [1, 3, 7, 14, 30] as const;

// Quiet-hours picker. A small set of friendly windows, e.g. "tw:quiet:22:8".
export const QUIET_PREFIX = 'tw:quiet:';
export const QUIET_OPTIONS: ReadonlyArray<{ start: number; end: number; label: string }> = [
  { start: 22, end: 8, label: 'من ١٠ مساءً حتى ٨ صباحًا' },
  { start: 23, end: 7, label: 'من ١١ مساءً حتى ٧ صباحًا' },
  { start: 0, end: 6, label: 'من منتصف الليل حتى ٦ صباحًا' },
  { start: 0, end: 0, label: 'بدون ساعات هدوء' },
];

// Pause/resume toggle in /settings.
export const PAUSE_TOGGLE = 'tw:pause:toggle';

// /forget confirmation.
export const FORGET_CONFIRM = 'tw:forget:yes';
export const FORGET_CANCEL = 'tw:forget:no';

/**
 * The action buttons under every nudge: «تواصلت» / «فكّرني بعدين» / «تخطّي».
 * The personId rides in the callback data so the handler updates the right
 * relative without re-reading the rotation.
 */
export function buildNudgeKeyboard(personId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.btnContacted, `${ACTION_PREFIX}${ACTION_CONTACTED}:${personId}`)
    .row()
    .text(COPY.btnSnooze, `${ACTION_PREFIX}${ACTION_SNOOZE}:${personId}`)
    .text(COPY.btnSkip, `${ACTION_PREFIX}${ACTION_SKIP}:${personId}`);
}

/** One button per person, for /remove. */
export function buildRemoveKeyboard(people: readonly RotationPerson[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const person of people) {
    kb.text(personLabel(person.name, person.relation), `${REMOVE_PREFIX}${person.id}`).row();
  }
  return kb;
}

/**
 * The interactive /list keyboard: one button per person on the given page,
 * labelled «{name} · {compact last-contacted}», followed by a pagination row
 * with only the arrows that apply. `people` is expected pre-sorted
 * (sortByContactPriority) so the most-due relative sits at the top. `now` and
 * `timezone` are passed in (no clock here) so the compact phrase is testable.
 */
export function buildPeopleListKeyboard(
  people: readonly RotationPerson[],
  page: number,
  pageSize: number,
  timezone: string,
  now: Date,
): InlineKeyboard {
  const pageCount = Math.max(1, Math.ceil(people.length / pageSize));
  // Clamp so a stale/edge page number can never read past the array.
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const slice = people.slice(start, start + pageSize);

  const kb = new InlineKeyboard();
  for (const person of slice) {
    const label = `${personLabel(person.name, person.relation)} · ${lastContactedCompactAr(
      person.lastContactedAt,
      timezone,
      now,
    )}`;
    kb.text(label, `${PERSON_PREFIX}${person.id}`).row();
  }

  // Bottom nav: «‹ السابق» on the left, «التالي ›» on the right, each only when
  // there is somewhere to go.
  if (safePage > 1) kb.text(COPY.btnPrevPage, `${LIST_PAGE_PREFIX}${safePage - 1}`);
  if (safePage < pageCount) kb.text(COPY.btnNextPage, `${LIST_PAGE_PREFIX}${safePage + 1}`);
  return kb;
}

/**
 * The per-person detail card keyboard: mark contacted (reuses the nudge
 * «تواصلت» action so the same person is recorded), tune how often we remind
 * about this relative, remove, and back to the list.
 */
export function buildPersonDetailKeyboard(personId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.btnContacted, `${PERSON_CONTACTED_PREFIX}${personId}`)
    .row()
    .text(COPY.btnPersonCadence, `${PERSON_CADENCE_PREFIX}${personId}`)
    .row()
    .text(COPY.btnRemovePerson, `${REMOVE_PREFIX}${personId}`)
    .row()
    .text(COPY.btnBackToList, `${LIST_PAGE_PREFIX}1`);
}

/** A lone «‹ رجوع للقائمة» row, shown after acting from the detail card. */
export function buildBackToListKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text(COPY.btnBackToList, `${LIST_PAGE_PREFIX}1`);
}

/**
 * The per-relative cadence picker, opened from a person's detail card. One
 * button per option (the current choice is marked), then a row back to the
 * detail card. `current` is the person's cadenceDays so the active option reads
 * as selected.
 */
export function buildPersonCadenceKeyboard(personId: number, current: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const days of CADENCE_OPTIONS) {
    const label = days === current ? `✅ ${cadenceSummaryAr(days)}` : cadenceSummaryAr(days);
    kb.text(label, `${PERSON_CADENCE_SET_PREFIX}${personId}:${days}`).row();
  }
  kb.text(COPY.btnBackToPerson, `${PERSON_PREFIX}${personId}`);
  return kb;
}

/**
 * The per-user default-cadence picker, opened from /settings. One button per
 * option (the current default is marked); choosing one sets the cadence new
 * relatives will inherit. `current` is the user's defaultCadenceDays.
 */
export function buildDefaultCadenceKeyboard(current: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const days of CADENCE_OPTIONS) {
    const label = days === current ? `✅ ${cadenceSummaryAr(days)}` : cadenceSummaryAr(days);
    kb.text(label, `${DEFAULT_CADENCE_PREFIX}${days}`).row();
  }
  return kb;
}

/** The quiet-hours picker. */
export function buildQuietKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const opt of QUIET_OPTIONS) {
    kb.text(opt.label, `${QUIET_PREFIX}${opt.start}:${opt.end}`).row();
  }
  return kb;
}

/** The small keyboard under /settings: default cadence for new relatives, quiet
 *  hours, and pause/resume. (Each relative's own cadence is tuned from their
 *  card in /list.) */
export function buildSettingsKeyboard(paused: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.settingsDefaultCadenceBtn, `${DEFAULT_CADENCE_PREFIX}open`)
    .row()
    .text(COPY.settingsQuietBtn, `${QUIET_PREFIX}open`)
    .row()
    .text(paused ? COPY.resumeBtn : COPY.pauseBtn, PAUSE_TOGGLE);
}

/** The /forget confirm/cancel keyboard. */
export function buildForgetKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.forgetConfirmBtn, FORGET_CONFIRM)
    .row()
    .text(COPY.forgetCancelBtn, FORGET_CANCEL);
}

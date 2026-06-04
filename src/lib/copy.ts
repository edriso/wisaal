// All the Arabic text the bot shows. Kept in one file so wording is easy to
// review and change without touching logic. The voice is warm, modern standard
// Arabic (not dialect), and never guilt-based: صلة الأرحام is an act of love and
// mercy, so every line encourages rather than scolds.
//
// Bidi note: this text is right-to-left, but commands, clock times and
// timezone names are left-to-right. When a left-to-right run sits in the middle
// of Arabic, the punctuation around it can render in the wrong order (a known
// bidi problem). The ltr() helper below wraps such a run in Unicode isolate
// characters so it always renders correctly. A lone command at the very end of
// a line is fine without it, so we only wrap the tricky cases.

import { getLocalContext, toArabicDigits } from '../core';
import type { Reminder } from '../database/reference/reminders';

// Unicode isolate characters: First Strong Isolate (U+2066) ... Pop
// Directional Isolate (U+2069). The standard recommends these (over the older
// embedding marks) for dropping a left-to-right run into right-to-left text.
// Built from code points because the characters themselves are invisible.
const FIRST_STRONG_ISOLATE = String.fromCodePoint(0x2066);
const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069);

/** Wrap a left-to-right run (a command, a time, a timezone) so it renders
 *  correctly inside right-to-left Arabic text. */
export function ltr(run: string): string {
  return `${FIRST_STRONG_ISOLATE}${run}${POP_DIRECTIONAL_ISOLATE}`;
}

/** "خالتي فاطمة" — the relation label (if any) followed by the name. The
 *  relation is optional, so a bare name reads naturally on its own. */
export function personLabel(name: string, relation?: string | null): string {
  return relation ? `${relation} ${name}` : name;
}

/** Describe the cadence in friendly Arabic, with natural words for the common
 *  spans (daily, weekly, fortnightly, monthly) and correct number-noun
 *  agreement for the rest. */
export function cadenceSummaryAr(cadenceDays: number): string {
  if (cadenceDays === 1) return 'كل يوم';
  if (cadenceDays === 2) return 'كل يومين';
  if (cadenceDays === 7) return 'كل أسبوع';
  if (cadenceDays === 14) return 'كل أسبوعين';
  if (cadenceDays === 30) return 'كل شهر';
  if (cadenceDays <= 10) return `كل ${toArabicDigits(cadenceDays)} أيام`;
  return `كل ${toArabicDigits(cadenceDays)} يومًا`;
}

/** Whole local days between two instants, in the given timezone (b − a). */
function localDaysBetween(timezone: string, a: Date, b: Date): number {
  const aDate = getLocalContext(timezone, a).date;
  const bDate = getLocalContext(timezone, b).date;
  const aMs = Date.parse(`${aDate}T00:00:00Z`);
  const bMs = Date.parse(`${bDate}T00:00:00Z`);
  return Math.round((bMs - aMs) / 86_400_000);
}

/** A natural, standalone Arabic phrase for how long ago contact happened, given
 *  whole local days. Arabic has single words for the recent days, so we use them
 *  instead of a counted phrase: today reads "اليوم", one day ago "أمس", two days
 *  ago "أول أمس", and beyond that "قبل N يومًا" with number-noun agreement.
 *  Shared by the list button and the detail card so they always agree. */
function relativeDayAr(days: number): string {
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days === 2) return 'أول أمس';
  if (days <= 10) return `قبل ${toArabicDigits(days)} أيام`;
  return `قبل ${toArabicDigits(days)} يومًا`;
}

/** The "last reached out" value for a person's detail card, in the user's
 *  timezone. It reads as a bare value after the "آخر تواصل:" label, so the
 *  never case is worded for that slot. */
export function lastContactedAr(lastContactedAt: Date | null, timezone: string, now: Date): string {
  if (lastContactedAt === null) return COPY.lastContactedNeverCard;
  return relativeDayAr(localDaysBetween(timezone, lastContactedAt, now));
}

/** A SHORT last-contacted phrase for an inline button label (kept compact so
 *  the button stays on one line): "لم تتواصل بعد" / "اليوم" / "أمس" / "أول أمس"
 *  / "قبل ٣ أيام". Same day math as lastContactedAr, just a fuller never case. */
export function lastContactedCompactAr(
  lastContactedAt: Date | null,
  timezone: string,
  now: Date,
): string {
  if (lastContactedAt === null) return COPY.lastContactedNever;
  return relativeDayAr(localDaysBetween(timezone, lastContactedAt, now));
}

/** A short calendar date in the user's timezone, in Arabic-Indic digits, e.g.
 *  "٢٠٢٦/٠٦/٠٣". Used to date gratitude-journal entries. Wrapped ltr so the
 *  slashed number run renders correctly inside right-to-left text. */
export function shortDateAr(date: Date, timezone: string): string {
  const ymd = getLocalContext(timezone, date).date; // "YYYY-MM-DD"
  const arabic = ymd.replace(/-/g, '/').replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  return ltr(arabic);
}

/** Longest gratitude preview shown on a journal button (kept short so the
 *  button stays on one line). */
const SHUKR_PREVIEW_MAX = 30;

/** A one-line, length-capped preview of a gratitude note for a button label. */
export function shukrPreview(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= SHUKR_PREVIEW_MAX
    ? oneLine
    : `${oneLine.slice(0, SHUKR_PREVIEW_MAX - 1)}…`;
}

/**
 * The daily nudge. A gentle opening line, then the relative's name, a blank
 * line, then the encouragement (with its source if it carries one). Plain text
 * only — no Markdown, so the Quran/hadith glyphs never break a parsed send.
 */
export function nudgeMessage(personDisplay: string, reminder: Reminder): string {
  const lines = [
    'حان وقت صلةِ الأرحامِ 🤍',
    '',
    `ما رأيك أن تطمئنّ اليوم على ${personDisplay}؟`,
    '',
    reminder.text,
  ];
  if (reminder.source) lines.push('', reminder.source);
  return lines.join('\n');
}

/**
 * A short summary of the user's current settings, for /start (returning) and
 * /settings. Cadence, quiet window, and timezone, each on its own line.
 */
export function settingsSummary(user: {
  defaultCadenceDays: number;
  quietStartHour: number;
  quietEndHour: number;
  timezone: string;
  paused: boolean;
}): string {
  const lines = [
    COPY.settingsHeader,
    // The default new relatives inherit; each one is then tunable from /list.
    `• تذكير الأقارب الجدد: ${cadenceSummaryAr(user.defaultCadenceDays)} (ويُضبط لكل قريب من ${ltr('/list')})`,
    `• ${quietWindowAr(user.quietStartHour, user.quietEndHour)}`,
    `• المنطقة الزمنية: ${ltr(user.timezone)}`,
  ];
  if (user.paused) lines.push('• الحالة: التذكيرات متوقفة مؤقتًا ⏸️');
  return lines.join('\n');
}

/** Describe the quiet window in friendly Arabic, handling the empty case. */
export function quietWindowAr(startHour: number, endHour: number): string {
  if (startHour === endHour) return 'بدون ساعات هدوء';
  const fmt = (h: number) => ltr(`${String(h).padStart(2, '0')}:00`);
  return `ساعات الهدوء من ${fmt(startHour)} حتى ${fmt(endHour)}`;
}

export const COPY = {
  // ─── Bot profile (set on startup via the Bot API, like the commands) ──
  // About = the short blurb on the bot's profile card (Telegram limit 120).
  botAbout: 'رفيق لطيف يذكّرك بصلة رحمك، واحدًا تلو الآخر، على الإيقاع الذي تختاره، بلا عتاب 🤍',
  // Description = the text on the empty chat, shown before /start (limit 512).
  botDescription:
    'وِصَال يعينك على صِلةِ الأرحامِ في زحمة الأيام.\n\n' +
    'أضِف مَن تحبّ من أهلك، وحدّد لكلٍّ منهم كل كم تحبّ أن نذكّرك بصلته (أسبوعيًّا ما لم تختر غير ذلك)، فيختار لك وِصَال في كل مرّة شخصًا واحدًا، هو الأحوج إلى تواصلك، برسالةٍ لطيفة وتذكيرٍ بفضل صِلةِ الأرحامِ.\n\n' +
    'وحين تتواصل، أخبِرنا بضغطة زر فينتقل إلى آخر الدور كي لا تنسى أحدًا. بلا عتابٍ ولا ضغط؛ مجرّد لمسةٍ تُقرّبك ممّن تحبّ.\n\n' +
    'اضغط /start لتبدأ 🤍',

  // ─── Acknowledgements (warm, never guilt) ────────────────────────────
  // After the user marks that they reached out.
  contacted: 'حفظكم الله لبعضكم 🤍 جعلها الله صلةً موصولة، وزادك من فضله.',
  // After "remind me later" / snooze.
  snoozed: 'لا بأس، سأذكّرك لاحقًا بإذن الله. خذ وقتك 🤍',
  // After "skip this one" — move the rotation along with no pressure.
  skipped: 'تمام، سننتقل إلى غيره في المرة القادمة بإذن الله 🤍',

  // ─── Onboarding ──────────────────────────────────────────────────────
  // Brand-new user. A warm intro to صلة الأرحام, a one-line privacy note, and a
  // prompt to /add their first relative.
  welcomeNew: [
    'السلام عليكم ورحمة الله 🌿',
    '',
    'مرحبًا بك في بوت «وصال». صلةُ الأرحامِ بابٌ من أبواب الرحمة والمحبة، وفيها بركةٌ في العمر والرزق. يذكّرك هذا البوت بلطف، على الإيقاع الذي تختاره، بأن تَصِل واحدًا من أهلك وأرحامك، واحدًا تلو الآخر، دون أن تنسى أحدًا، بلا أيّ عتاب أو ضغط.',
    '',
    'خصوصيتك: لا نحفظ سوى رقم محادثتك والأسماء التي تكتبها بنفسك. ولا نقرأ رسائلك إلى أحد. ومتى أردت، يمحو الأمر /forget كلّ بياناتك نهائيًا.',
    '',
    `لنبدأ بإضافة من تحبّ أن تَصِلهم: اكتب ${ltr('/add')} متبوعًا بالاسم.`,
  ].join('\n'),

  // Returning user: a short greeting plus their current settings summary.
  welcome: (summary: string) => `أهلًا بعودتك إلى «وصال» 🌿\n\n${summary}`,

  // ─── Adding / listing / removing people ──────────────────────────────
  addPrompt: 'اكتب اسم الشخص الذي تريد إضافته (ويمكنك إضافة صلة القرابة، مثل: خالتي فاطمة).',
  addEmpty: 'لم أتمكن من قراءة الاسم. حاول مرة أخرى بكتابة الاسم فقط.',
  addedOne: (display: string) => `أضفتُ ${display} إلى عائلتك 🤍`,
  listEmpty: `لم تُضِف أحدًا بعد. أضِف أول اسم بـ ${ltr('/add')} لتبدأ صلةَ الأرحامِ.`,
  // The never-contacted phrasing. The button stands alone, so it reads as a full
  // sentence; the card sits after an "آخر تواصل:" label, so it reads as a value.
  lastContactedNever: 'لم تتواصل بعد',
  lastContactedNeverCard: 'لم يحدث بعد',
  removePrompt: 'اختر من تريد إزالته من عائلتك.',
  removeEmpty: 'لا أحد في عائلتك لإزالته.',
  removedOne: (display: string) => `أزلتُ ${display} من عائلتك.`,

  // ─── /list — the interactive, sorted, paginated browser ──────────────
  // Header for the people list. The note explains the order gently: whoever you
  // have gone longest without reaching (never-contacted first) sits at the top —
  // framed as "who most needs your صلة", never as overdue/blame.
  listBrowseHeader:
    'عائلتك، مرتّبة حسب الأحوج لصِلتك 🤍\n\nاضغط على أيّ اسم لرؤية تفاصيله، أو لتسجيل أنّك تواصلت معه، أو لضبط كل كم نذكّرك بصلته.',
  // The detail card for one person: name (+ relation), then the full
  // last-contacted phrase and the per-relative reminder cadence, each on its
  // own line.
  personDetail: (display: string, lastContacted: string, cadence: string) =>
    `${display}\n\nآخر تواصل: ${lastContacted}\nنذكّرك بصلته: ${cadence}`,
  // Warm ack after marking contacted proactively from the list (NOT a nudge
  // cycle — just recording the good deed). Mirrors the nudge `contacted` voice.
  contactedFromList: (display: string) =>
    `جزاك الله خيرًا 🤍 سجّلتُ تواصلك مع ${display}. جعلها الله صلةً موصولة.`,
  // Pagination + back labels. Arrows point the natural RTL way (‹ = next page in
  // reading flow); the text spells the direction so it stays clear.
  btnPrevPage: '‹ السابق',
  btnNextPage: 'التالي ›',
  btnBackToList: '‹ رجوع للقائمة',
  // Detail-card action buttons (the proactive «تواصلت» reuses the nudge label).
  btnRemovePerson: 'إزالة 🗑️',
  btnPersonCadence: '⏱️ كل كم نذكّرك؟',
  btnBackToPerson: '‹ رجوع',
  // The per-relative cadence picker, opened from a person's card.
  personCadencePrompt: (display: string) => `كل كم تحب أن نذكّرك بصلة ${display}؟`,
  personCadenceUpdated: (display: string, summary: string) =>
    `تمام، سنذكّرك بصلة ${display} ${summary} 🤍`,

  // ─── Settings: default cadence, quiet hours, timezone, pause ─────────
  settingsHeader: 'إعداداتك الحالية:',
  settingsDefaultCadenceBtn: '⏱️ تذكير الأقارب الجدد',
  // The default-cadence picker, opened from /settings. Sets the starting
  // cadence new relatives inherit; existing ones keep their own.
  defaultCadencePrompt:
    'كل كم تحب أن نذكّرك بالأقارب الذين تضيفهم لاحقًا؟\n\n(لن يتغيّر إعداد من أضفتهم سابقًا؛ كل قريب يُضبط من قائمته في /list.)',
  defaultCadenceUpdated: (summary: string) => `تمام، سنذكّرك بالأقارب الجدد ${summary} 🤍`,
  settingsQuietBtn: '🌙 ساعات الهدوء',
  quietPrompt: 'في أي ساعات تحب ألّا تصلك التذكيرات؟',
  quietUpdated: (window: string) => `تم ضبط ${window} ✅`,
  tzUpdated: (tz: string) => `تم ضبط المنطقة الزمنية على ${ltr(tz)} ✅`,

  // ─── /now — send a nudge immediately, outside the schedule ───────────
  nowNoPeople: `أضِف أحدًا إلى عائلتك أولًا (بـ ${ltr('/add')}) حتى أذكّرك بصلته 🤍`,
  // Shown when /now is run again after today's nudge was already claimed.
  nowAlready: 'هذا هو تذكير اليوم 🤍',

  // ─── Nudge action button labels ──────────────────────────────────────
  btnContacted: 'تواصلت ✅',
  btnSnooze: 'فكّرني بعدين ⏰',
  btnSkip: 'تخطّي',

  // ─── Pause / resume ──────────────────────────────────────────────────
  pauseBtn: '⏸️ إيقاف التذكيرات',
  resumeBtn: '▶️ استئناف التذكيرات',
  paused: `تم إيقاف التذكيرات مؤقتًا 🌿 ومتى أردت العودة اكتب ${ltr('/resume')}.`,
  resumed: 'أهلًا بعودتك 🌿 سنواصل تذكيرك بصلة أرحامك بإذن الله.',
  alreadyPaused: 'التذكيرات متوقفة بالفعل 🌿',
  alreadyActive: 'التذكيرات تعمل بالفعل 🌿',

  // ─── /forget — wipe ALL of the user's data ───────────────────────────
  forgetPrompt:
    'هل تريد محو كل بياناتك نهائيًا؟ سيُحذف رقم محادثتك وكل الأسماء التي أضفتها وكل سجلّك. لا يمكن التراجع عن هذا.',
  forgetConfirmBtn: '🗑️ نعم، امحُ كل شيء',
  forgetCancelBtn: 'تراجع',
  forgetDone: 'تم محو كل بياناتك. نسأل الله أن يصل قلبك بأرحامك دائمًا 🤍',
  forgetNothing: 'لا توجد بيانات لمحوها أصلًا 🌿',
  forgetCancelled: 'تمام، لم أمحُ شيئًا 🌿',

  // ─── /shukr — the optional gratitude journal ─────────────────────────
  // Onboarding text, shown only before the journal is enabled.
  shukrIntro:
    'دفتر الشكر ميزة اختيارية لطيفة: حين تُفعّلها، يمكنك تدوين لحظة امتنان قصيرة بعد كل وصل، والعودة إليها متى شئت لتتذكّر فضل الله عليك بأهلك. فعّلها بالزر.',
  shukrEnableBtn: 'تفعيل دفتر الشكر 🤍',
  shukrEnabled: 'تم تفعيل دفتر الشكر 🤍 اكتب الآن كلمةً عن وصلٍ أسعدك لأحفظها لك.',
  shukrDisabled: `تم إيقاف دفتر الشكر 🌿 (محفوظاتك باقية، وتعود متى فعّلته بـ ${ltr('/shukr')}).`,
  shukrSaved: `حفظتُها لك 🤍 الحمد لله على نعمة الأهل والأرحام. اكتب ${ltr('/shukr')} لتصفّح دفترك.`,
  shukrNotEnabled: `دفتر الشكر غير مُفعّل. فعّله أولًا بـ ${ltr('/shukr')}.`,
  // The journal browser (enabled, with entries).
  shukrJournalHeader:
    'دفتر الشكر 🤍 لحظاتك التي أسعدك فيها وصلُ الأرحامِ. اضغط أيّ لحظة لقراءتها أو حذفها.',
  // Enabled, but nothing recorded yet.
  shukrEmpty: 'دفتر الشكر مُفعّل ولا توجد لحظات بعد 🤍 اضغط «أضف لحظة شكر» لتدوين أوّل لحظة.',
  // One entry opened from the journal: its date, then the full note.
  shukrEntryDetail: (dateAr: string, text: string) => `🤍 ${dateAr}\n\n${text}`,
  shukrRemoved: 'حذفتُ تلك اللحظة 🌿',
  // Prompt after tapping «أضف لحظة شكر».
  shukrAddPrompt: 'اكتب لحظة امتنان قصيرة عن وصلٍ أسعدك، لأحفظها لك في دفترك 🤍',
  // Journal buttons.
  btnShukrAdd: '➕ أضف لحظة شكر',
  btnShukrDisable: 'إيقاف الدفتر',
  btnShukrRemove: 'حذف 🗑️',
  btnShukrBack: '‹ رجوع للدفتر',

  // ─── /help — full command list ───────────────────────────────────────
  help: [
    'بوت «وصال» يذكّرك بلطف بصلة أرحامك، واحدًا تلو الآخر.',
    '',
    'الأوامر:',
    `${ltr('/add')} · إضافة شخص إلى عائلتك`,
    `${ltr('/list')} · تصفّح عائلتك (مرتّبة حسب الأحوج لصلتك)، وسجّل تواصلك واضبط كل كم نذكّرك بكل قريب`,
    `${ltr('/remove')} · إزالة شخص من عائلتك`,
    `${ltr('/now')} · تذكير فوري بمن يأتي دوره`,
    `${ltr('/settings')} · ضبط تذكير الأقارب الجدد وساعات الهدوء`,
    `${ltr('/pause')} · إيقاف التذكيرات، و${ltr('/resume')} للعودة`,
    `${ltr('/shukr')} · دفتر الشكر: دوّن لحظات الامتنان وتصفّحها (اختياري)`,
    `${ltr('/forget')} · محو كل بياناتك`,
    `${ltr('/help')} · هذه القائمة`,
  ].join('\n'),

  // Generic fallback for an unrecognised message.
  fallback: `لم أفهم ذلك تمامًا. اكتب ${ltr('/help')} لرؤية الأوامر المتاحة.`,
};

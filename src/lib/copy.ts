// All the Arabic text the bot shows. Kept in one file so wording is easy to
// review and change without touching logic. The voice is warm, modern standard
// Arabic (not dialect), and never guilt-based: صلة الرحم is an act of love and
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

/** A friendly Arabic "last reached out" phrase for /list, in the user's
 *  timezone. Null lastContactedAt reads as "not yet"; the same local day reads
 *  as "today"; otherwise "N days ago" with number-noun agreement. */
export function lastContactedAr(lastContactedAt: Date | null, timezone: string, now: Date): string {
  if (lastContactedAt === null) return COPY.lastContactedNever;
  const days = localDaysBetween(timezone, lastContactedAt, now);
  if (days <= 0) return COPY.lastContactedToday;
  let unit: string;
  if (days === 1) unit = 'يوم';
  else if (days === 2) unit = 'يومين';
  else if (days <= 10) unit = `${toArabicDigits(days)} أيام`;
  else unit = `${toArabicDigits(days)} يومًا`;
  return COPY.lastContactedAgo(unit);
}

/** A SHORT last-contacted phrase for an inline button label (kept compact so
 *  the button stays on one line): "لم تتواصل بعد" / "اليوم" / "قبل ٣ أيام".
 *  Same day math as lastContactedAr, just terser. */
export function lastContactedCompactAr(
  lastContactedAt: Date | null,
  timezone: string,
  now: Date,
): string {
  if (lastContactedAt === null) return COPY.lastContactedNever;
  const days = localDaysBetween(timezone, lastContactedAt, now);
  if (days <= 0) return COPY.lastContactedTodayCompact;
  let unit: string;
  if (days === 1) unit = 'يوم';
  else if (days === 2) unit = 'يومين';
  else if (days <= 10) unit = `${toArabicDigits(days)} أيام`;
  else unit = `${toArabicDigits(days)} يومًا`;
  return `قبل ${unit}`;
}

/**
 * The daily nudge. A gentle opening line, then the relative's name, a blank
 * line, then the encouragement (with its source if it carries one). Plain text
 * only — no Markdown, so the Quran/hadith glyphs never break a parsed send.
 */
export function nudgeMessage(personDisplay: string, reminder: Reminder): string {
  const lines = [
    'حان وقت صلة الرحم 🤍',
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
  botAbout: 'رفيق لطيف يذكّرك بصلة رحمك، واحدًا تلو الآخر، على الإيقاع الذي تختاره — بلا عتاب 🤍',
  // Description = the text on the empty chat, shown before /start (limit 512).
  botDescription:
    'وِصَال يعينك على صِلة الرحم في زحمة الأيام.\n\n' +
    'أضِف مَن تحبّ من أهلك، وحدّد لكلٍّ منهم كل كم تحبّ أن نذكّرك بصلته (أسبوعيًّا ما لم تختر غير ذلك)، فيختار لك وِصَال في كل مرّة شخصًا واحدًا — الأحوج إلى تواصلك — برسالةٍ لطيفة وتذكيرٍ بفضل صِلة الرحم.\n\n' +
    'حين تتواصل، أخبِرنا بضغطة زر فينتقل إلى آخر الدور كي لا تنسى أحدًا. بلا عتابٍ ولا ضغط؛ مجرّد لمسةٍ تُقرّبك ممّن تحبّ.\n\n' +
    'اضغط /start لتبدأ 🤍',

  // ─── Acknowledgements (warm, never guilt) ────────────────────────────
  // After the user marks that they reached out.
  contacted: 'ربنا يخليكم لبعض 🤍 جعلها الله صلةً موصولة، وزادك من فضله.',
  // After "remind me later" / snooze.
  snoozed: 'لا بأس، سأذكّرك لاحقًا بإذن الله. خذ وقتك 🤍',
  // After "skip this one" — move the rotation along with no pressure.
  skipped: 'تمام، سننتقل إلى غيره في المرة القادمة بإذن الله 🤍',

  // ─── Onboarding ──────────────────────────────────────────────────────
  // Brand-new user. A warm intro to صلة الرحم, a one-line privacy note, and a
  // prompt to /add their first relative.
  welcomeNew: [
    'السلام عليكم ورحمة الله 🌿',
    '',
    'مرحبًا بك في بوت "وصال". صلةُ الرحم بابٌ من أبواب الرحمة والمحبة، وفيها بركةٌ في العمر والرزق. يذكّرك هذا البوت بلطف، على الإيقاع الذي تختاره، بأن تَصِل واحدًا من أهلك وأرحامك، واحدًا تلو الآخر، دون أن تنسى أحدًا — بلا أيّ عتاب أو ضغط.',
    '',
    'خصوصيتك: لا نحفظ سوى رقم محادثتك والأسماء التي تكتبها بنفسك. ولا نقرأ رسائلك إلى أحد. ومتى أردت، يمحو الأمر /forget كلّ بياناتك نهائيًا.',
    '',
    `لنبدأ بإضافة من تحبّ أن تَصِلهم: اكتب ${ltr('/add')} متبوعًا بالاسم.`,
  ].join('\n'),

  // Returning user: a short greeting plus their current settings summary.
  welcome: (summary: string) => `أهلًا بعودتك إلى "وصال" 🌿\n\n${summary}`,

  // ─── Adding / listing / removing people ──────────────────────────────
  addPrompt: 'اكتب اسم الشخص الذي تريد إضافته (ويمكنك إضافة صلة القرابة، مثل: خالتي فاطمة).',
  addEmpty: 'لم أتمكن من قراءة الاسم. حاول مرة أخرى بكتابة الاسم فقط.',
  addedOne: (display: string) => `أضفتُ ${display} إلى دائرتك 🤍`,
  listEmpty: `دائرتك فارغة حتى الآن. أضف أول شخص بـ ${ltr('/add')} لتبدأ صلة الرحم.`,
  lastContactedNever: 'لم تتواصل بعد',
  lastContactedAgo: (daysAr: string) => `آخر تواصل قبل ${daysAr}`,
  lastContactedToday: 'تواصلت اليوم',
  lastContactedTodayCompact: 'اليوم',
  removePrompt: 'اختر من تريد إزالته من دائرتك.',
  removeEmpty: 'دائرتك فارغة، فلا أحد لإزالته.',
  removedOne: (display: string) => `أزلتُ ${display} من دائرتك.`,

  // ─── /list — the interactive, sorted, paginated browser ──────────────
  // Header for the people list. The note explains the order gently: whoever you
  // have gone longest without reaching (never-contacted first) sits at the top —
  // framed as "who most needs your صلة", never as overdue/blame.
  listBrowseHeader:
    'دائرتك — مرتّبة حسب الأحوج لصِلتك 🤍\n\nاضغط على أيّ اسم لرؤية تفاصيله، أو لتسجيل أنّك تواصلت معه، أو لضبط كل كم نذكّرك بصلته.',
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
    'كل كم تحب أن نذكّرك بالأقارب الذين تضيفهم لاحقًا؟\n\n(لن يتغيّر إعداد من أضفتهم سابقًا — كل قريب يُضبط من قائمته في /list.)',
  defaultCadenceUpdated: (summary: string) => `تمام، سنذكّرك بالأقارب الجدد ${summary} 🤍`,
  settingsQuietBtn: '🌙 ساعات الهدوء',
  quietPrompt: 'في أي ساعات تحب ألّا تصلك التذكيرات؟',
  quietUpdated: (window: string) => `تم ضبط ${window} ✅`,
  tzUpdated: (tz: string) => `تم ضبط المنطقة الزمنية على ${ltr(tz)} ✅`,

  // ─── /now — send a nudge immediately, outside the schedule ───────────
  nowNoPeople: `أضف أحدًا إلى دائرتك أولًا (بـ ${ltr('/add')}) حتى أذكّرك بصلته 🤍`,
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
  shukrIntro: (enabled: boolean) =>
    enabled
      ? 'دفتر الشكر مُفعّل 🤍 اكتب كلمةً عن وصلٍ أسعدك لأحفظها لك، أو أوقِف هذه الميزة بالزر.'
      : 'دفتر الشكر ميزة اختيارية لطيفة: حين تُفعّلها، يمكنك تدوين لحظة امتنان قصيرة بعد كل وصل. فعّلها بالزر.',
  shukrEnableBtn: 'تفعيل دفتر الشكر 🤍',
  shukrDisableBtn: 'إيقاف دفتر الشكر',
  shukrEnabled: 'تم تفعيل دفتر الشكر 🤍 اكتب الآن كلمةً عن وصلٍ أسعدك.',
  shukrDisabled: 'تم إيقاف دفتر الشكر 🌿',
  shukrSaved: 'حفظتُها لك 🤍 الحمد لله على نعمة الأهل والأرحام.',
  shukrNotEnabled: `دفتر الشكر غير مُفعّل. فعّله أولًا بـ ${ltr('/shukr')}.`,

  // ─── /help — full command list ───────────────────────────────────────
  help: [
    'بوت "وصال" يذكّرك بلطف بصلة أرحامك، واحدًا تلو الآخر.',
    '',
    'الأوامر:',
    `${ltr('/add')} — إضافة شخص إلى دائرتك`,
    `${ltr('/list')} — تصفّح دائرتك (مرتّبة حسب الأحوج لصلتك)، وسجّل تواصلك واضبط كل كم نذكّرك بكل قريب`,
    `${ltr('/remove')} — إزالة شخص من دائرتك`,
    `${ltr('/now')} — تذكير فوري بمن يأتي دوره`,
    `${ltr('/settings')} — ضبط تذكير الأقارب الجدد وساعات الهدوء`,
    `${ltr('/pause')} — إيقاف التذكيرات، و ${ltr('/resume')} للعودة`,
    `${ltr('/shukr')} — تدوين لحظة امتنان (اختياري)`,
    `${ltr('/forget')} — محو كل بياناتك`,
    `${ltr('/help')} — هذه القائمة`,
  ].join('\n'),

  // Generic fallback for an unrecognised message.
  fallback: `لم أفهم ذلك تمامًا. اكتب ${ltr('/help')} لرؤية الأوامر المتاحة.`,
};

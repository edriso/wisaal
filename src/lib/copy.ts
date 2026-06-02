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

import { toArabicDigits } from '../core';
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

/** Describe the cadence in friendly Arabic (1 = daily, 7 = weekly, else "every
 *  N days" with correct number-noun agreement). */
export function cadenceSummaryAr(cadenceDays: number): string {
  if (cadenceDays === 1) return 'كل يوم';
  if (cadenceDays === 2) return 'كل يومين';
  if (cadenceDays === 7) return 'كل أسبوع';
  if (cadenceDays <= 10) return `كل ${toArabicDigits(cadenceDays)} أيام`;
  return `كل ${toArabicDigits(cadenceDays)} يومًا`;
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

export const COPY = {
  // ─── Acknowledgements (warm, never guilt) ────────────────────────────
  // After the user marks that they reached out.
  contacted: 'ربنا يخليكم لبعض 🤍 جعلها الله صلةً موصولة، وزادك من فضله.',
  // After "remind me later" / snooze.
  snoozed: 'لا بأس، سأذكّرك لاحقًا بإذن الله. خذ وقتك 🤍',
  // After "skip this one" — move the rotation along with no pressure.
  skipped: 'تمام، سننتقل إلى غيره في المرة القادمة بإذن الله 🤍',

  // ─── Placeholders for phase 2 (handlers will fill these in) ──────────
  // Kept here now so the wording lives in one place from the start; phase 2
  // wires them to /start, the keyboards, and the commands.

  // Onboarding: shown to a brand-new user.
  welcomeNew: [
    'السلام عليكم ورحمة الله 🌿',
    '',
    'مرحبًا بك في بوت "تواصل". يذكّرك بلطف، على الإيقاع الذي تختاره، بأن تَصِل قريبًا واحدًا من أهلك وأرحامك، واحدًا تلو الآخر دون أن تنسى أحدًا.',
    '',
    'لنبدأ بإضافة من تحب أن تَصِلهم.',
  ].join('\n'),

  // Welcome back for a returning user. Phase 2 passes a settings summary.
  welcomeBack: 'أهلًا بعودتك إلى "تواصل" 🌿 من تحب أن تَصِل اليوم؟',

  // Adding / listing / removing people.
  addPrompt: 'اكتب اسم الشخص الذي تريد إضافته (ويمكنك إضافة صلة القرابة، مثل: خالتي فاطمة).',
  addEmpty: 'لم أتمكن من قراءة الاسم. حاول مرة أخرى بكتابة الاسم فقط.',
  addedOne: (display: string) => `أضفتُ ${display} إلى دائرتك 🤍`,
  listEmpty: 'دائرتك فارغة حتى الآن. أضف أول شخص لتبدأ صلة الرحم.',
  listHeader: 'دائرتك (مَن نذكّرك بصلتهم):',
  removePrompt: 'اختر من تريد إزالته من دائرتك.',
  removedOne: (display: string) => `أزلتُ ${display} من دائرتك.`,

  // Settings: cadence, quiet hours, timezone.
  settingsHeader: 'إعداداتك الحالية:',
  cadencePrompt: 'كل كم يوم تحب أن نذكّرك؟ (مثلًا كل يوم، كل ٣ أيام، كل أسبوع)',
  cadenceUpdated: (summary: string) => `تم ضبط التذكير ${summary} ✅`,
  quietPrompt: 'في أي ساعات تحب ألّا تصلك التذكيرات؟ (مثلًا من الليل حتى الصباح)',
  quietUpdated: 'تم ضبط ساعات الهدوء ✅',
  tzPrompt:
    'اختر منطقتك الزمنية من المدن التالية، أو اكتبها بنفسك بهذه الصيغة:\n' +
    `${ltr('/timezone Area/City')}\n` +
    `مثل ${ltr('/timezone Africa/Cairo')}`,
  tzInvalid: `اسم المنطقة الزمنية غير صحيح. مثال صحيح: ${ltr('Africa/Cairo')}`,
  tzUpdated: (tz: string) => `تم ضبط المنطقة الزمنية على ${ltr(tz)} ✅`,

  // /now — send a nudge immediately, outside the schedule.
  nowNoPeople: 'أضف أحدًا إلى دائرتك أولًا حتى أذكّرك بصلته 🤍',

  // /forget — clear a person's last-contacted history (reset rotation).
  forgetDone: 'تمام، أعدتُ ضبط الترتيب. سنبدأ من جديد بإذن الله.',

  // Pause / resume.
  paused: 'تم إيقاف التذكيرات مؤقتًا 🌿 وعندما تريد العودة اكتب /resume',
  resumed: 'أهلًا بعودتك 🌿 سنواصل تذكيرك بصلة أرحامك بإذن الله.',

  // /shukr — the optional gratitude journal.
  shukrPrompt: 'اكتب كلمةً عن لقاءٍ أو وصلٍ أسعدك، نحفظها لك في دفتر شكرك 🤍',
  shukrSaved: 'حفظتُها لك 🤍 الحمد لله على نعمة الأهل والأرحام.',

  // /help — full command list (phase 2 finalises the exact set).
  help: [
    'بوت "تواصل" يذكّرك بلطف بصلة أرحامك، واحدًا تلو الآخر.',
    '',
    'الأوامر:',
    '/add: إضافة شخص إلى دائرتك',
    '/list: عرض دائرتك',
    '/remove: إزالة شخص من دائرتك',
    '/now: تذكير فوري بمن يأتي دوره',
    '/settings: عرض وضبط إعداداتك',
    '/pause: إيقاف التذكيرات مؤقتًا، و /resume للعودة',
    '/shukr: تدوين لحظة امتنان',
  ].join('\n'),

  // Generic fallback when something is not ready yet.
  fallback: 'لم أفهم ذلك تمامًا. اكتب /help لرؤية الأوامر المتاحة.',
};

// The warm, authentic encouragements the bot pairs with each nudge.
//
// GOLDEN RULE: this text is Islamic content. Never hand-edit, paraphrase, add
// to, or reorder the hadith/ayah entries or their sources. Every entry is
// positive and encouraging by design — صلة الرحم is framed as mercy, rizq, and
// love, never as guilt or punishment. The first seven carry a scholarly source
// (متفق عليه / Bukhari / a Quranic reference); the last three are gentle,
// source-less nudges to act today.

export interface Reminder {
  /** The Arabic text shown to the user. Plain text, within Telegram's limit. */
  text: string;
  /** Attribution (hadith collection or surah:ayah), or null for a soft nudge. */
  source: string | null;
}

export const reminders: readonly Reminder[] = [
  {
    text: 'صِلةُ الرحمِ تَبسُطُ الرزقَ وتُطيلُ الأثر. قال ﷺ: «مَن سَرَّهُ أن يُبسَطَ له في رزقِه، وأن يُنسَأَ له في أثرِه، فَليَصِلْ رَحِمَه».',
    source: 'متفق عليه — البخاري ٢٠٦٧، مسلم ٢٥٥٧',
  },
  {
    text: 'الرَّحِمُ مُعلَّقةٌ بالعرشِ تقول: «مَن وصَلَني وصَلَهُ اللهُ، ومَن قطَعَني قطَعَهُ اللهُ».',
    source: 'متفق عليه — البخاري، مسلم',
  },
  {
    text: 'قال ﷺ: «الرَّحِمُ شِجْنةٌ من الرحمن، فمَن وصَلَها وصَلْتُه، ومَن قطَعَها قطَعْتُه».',
    source: 'البخاري ٥٩٨٩',
  },
  {
    text: 'قال ﷺ: «مَن كان يؤمنُ باللهِ واليومِ الآخِرِ فَليَصِلْ رَحِمَه».',
    source: 'متفق عليه — البخاري ٦١٣٨',
  },
  {
    text: 'الواصلُ الحقُّ مَن يَصِلُ مَن قطعه. قال ﷺ: «ليس الواصلُ بالمُكافِئِ، ولكنّ الواصلَ الذي إذا قُطِعَتْ رَحِمُه وصَلَها».',
    source: 'البخاري ٥٩٩١',
  },
  {
    text: 'قال تعالى: ﴿وَاتَّقُوا اللَّهَ الَّذِي تَسَاءَلُونَ بِهِ وَالْأَرْحَامَ﴾.',
    source: 'النساء: ١',
  },
  {
    text: 'قال تعالى في وصفِ عبادِ الرحمن: ﴿وَالَّذِينَ يَصِلُونَ مَا أَمَرَ اللَّهُ بِهِ أَن يُوصَلَ﴾.',
    source: 'الرعد: ٢١',
  },
  {
    text: 'رسالةٌ قصيرةٌ أو اتصالٌ دقيقة... تكفي ليشعرَ مَن تُحبّ أنّه على بالك. 🤍',
    source: null,
  },
  {
    text: 'لا تنتظر مناسبةً لتَصِلَ رَحِمَك؛ مبادرتُك بالسؤال محبّةٌ وصدقة.',
    source: null,
  },
  {
    text: 'صِلةُ الرحمِ تُذهِبُ الوحشةَ وتزرعُ المودّة. تواصَلْ اليومَ مع مَن تُحبّ. 🤍',
    source: null,
  },
];

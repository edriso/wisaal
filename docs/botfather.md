# Wisaal — bot profile (@BotFather)

Reference for the bot's public profile. **Three fields are set automatically by
the bot on startup** (`setBotProfile` in `src/bot.ts`) — they live in the code
and apply on every deploy, so you don't touch @BotFather for them. The rest
(name, pictures) can only be set in @BotFather.

| Field                        | How it's set                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| **Name** — `وِصَال`          | @BotFather only (Edit Bot → Edit Name). Not via API (name changes are rate-limited). |
| **About** (short)            | **Auto** — `bot.api.setMyShortDescription` (text below)                       |
| **Description**              | **Auto** — `bot.api.setMyDescription` (text below)                            |
| **Commands** (10)            | **Auto** — `bot.api.setMyCommands` (list below)                              |
| **Botpic** (profile photo)   | @BotFather only (Edit Bot → Edit Botpic). The Bot API can't set photos.       |
| **Description picture**      | @BotFather only (Edit Bot → Edit Description Picture). Optional.              |

The source of truth for the automated three is the code: `botAbout` /
`botDescription` in `src/lib/copy.ts`, and the command list in `setBotProfile`
(`src/bot.ts`). Edit there and deploy; the bot pushes the change to @BotFather on
its next startup. Setting them by hand in @BotFather is optional/redundant now.

## About (≤ 120 chars)

```
رفيق لطيف يذكّرك بصلة رحمك، واحدًا تلو الآخر، على الإيقاع الذي تختاره — بلا عتاب 🤍
```

## Description (≤ 512 chars)

```
وِصَال يعينك على صِلة الرحم في زحمة الأيام.

أضِف مَن تحبّ من أهلك، واختَر كل كم يومًا نُذكّرك، فيختار لك وِصَال في كل مرّة شخصًا واحدًا — الأحوج إلى تواصلك — برسالةٍ لطيفة وتذكيرٍ بفضل صِلة الرحم.

حين تتواصل، أخبِرنا بضغطة زر فينتقل إلى آخر الدور كي لا تنسى أحدًا. بلا عتابٍ ولا ضغط؛ مجرّد لمسةٍ تُقرّبك ممّن تحبّ.

اضغط /start لتبدأ 🤍
```

## Commands (10) — in @BotFather's `command - description` format

```
now - تذكير فوري بمن يأتي دوره
add - إضافة شخص إلى دائرتك
list - عرض دائرتك
remove - إزالة شخص من دائرتك
settings - ضبط الإيقاع وساعات الهدوء
pause - إيقاف التذكيرات مؤقتًا
resume - استئناف التذكيرات
shukr - تدوين لحظة امتنان
forget - محو كل بياناتك
help - المساعدة
```

> `/start` is intentionally not in the menu (it's the implicit first message).

## Notes

- The automated fields apply once the bot is **live and started** (long-polling).
  After you deploy this change, open the bot and you'll see the About/Description
  populated on its profile and empty-chat screen.
- Name and pictures stay manual in @BotFather: the Bot API can't change the name
  without hitting rate limits, and can't set the profile photo or description
  picture at all.

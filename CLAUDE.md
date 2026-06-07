# CLAUDE.md

Notes for anyone (human or AI) working in this repo. Easy English on purpose.
The aim is that a junior developer can read this and be productive.

## What this is

Wisaal is a Telegram bot for **صلة الرحم** (keeping ties with relatives). For
each user it keeps a private circle of relatives and, outside their quiet hours,
nudges them to reach out to ONE relative at a time — rotating fairly so no one is
forgotten — with a warm, authentic encouragement. Each relative has their OWN
cadence (how often to be reminded about them), so a user can keep in closer touch
with some than others. A new relative inherits the user's default cadence
(`User.defaultCadenceDays`, weekly out of the box, settable in `/settings`) and
is then tunable per person from `/list`. Arabic-only (modern standard Arabic, the
same warm voice as the `ayah` and `tilawah` bots, NOT dialect).

It is one small TypeScript project, everything under `src/`:

- `src/core` — pure logic, no database, no network. Fully unit-tested.
- `src/database` — the Prisma client and the database services
  (`services/{user,person,nudge}.service.ts`). Reference content (the
  reminders) lives in `src/database/reference`.
- `src/` (bot.ts, scheduler.ts, lib/, …) — the grammY bot (commands +
  callbacks), the database services, and the per-minute nudge scheduler.
  `prisma/` holds the schema and migrations.

The cross-bot kernel lives in **`telegram-bot-kit`** (a separate public repo,
pinned by git tag in `package.json`): timezone/schedule math, the active-day
bitmask, Arabic-Indic digits, the root `.env` loader, the logger, and the
plain-text send wrapper. The matching files here
(`src/core/{schedule,days,arabic,env}.ts`, `src/lib/{send,logger}.ts`) are
one-line re-export shims, so the shared code lives (and is tested) once, in the
kernel. To change that code: edit the kernel, tag a new version, and bump the
pin here. The `ayah` and `tilawah` bots consume the same kernel.

## How a nudge gets decided

Three pure functions in `src/core` carry the logic (all take `now` as an
argument, so every case is testable):

1. `isUserAvailable({ now, user })` (`eligibility.ts`) — is the USER in a state
   to receive any nudge at all? True only if not paused, not blocked, not
   currently snoozed, and the user's local hour is OUTSIDE their quiet window
   (which may wrap past midnight).
2. `isPersonDue({ now, timezone, person })` (`eligibility.ts`) — is a given
   RELATIVE due, by THEIR own cadence? True if never contacted, or at least
   `person.cadenceDays` whole LOCAL days have passed since `lastContactedAt`
   (boundary inclusive). This is what makes cadence per-relative.
3. `pickNextPerson(people, now?)` (`rotation.ts`) — the next relative is the one
   contacted longest ago; a never-contacted person always comes first; ties
   break by `createdAt` then `id`. It is `sortByContactPriority(people)[0]`:
   the same exported comparator `/list` renders by, so the top of the browse
   list IS the next nudge — they can never disagree. The scheduler picks the
   first person in that order who is ALSO `isPersonDue` (see `buildNudgeView`'s
   `dueOnly`); /now ignores due-ness and always surfaces the head of the order.

The reminder paired with each nudge is chosen by `pickReminder(now, index?)`
(`reminders.ts`), deterministic by UTC day.

## How the daily nudge works

`deliverDueUsers` (in `src/lib/deliver.ts`) runs every minute from
`scheduler.ts`. For each non-blocked user:

1. `isUserAvailable` checks their timezone, quiet hours, pause, and snooze.
2. If a nudge is already recorded for their local date, skip (the lock).
3. `buildNudgeView(..., { dueOnly: true })` picks the first relative in rotation
   order who is also `isPersonDue` by their own cadence; if nobody is due (all
   contacted recently enough, or an empty circle) the user is left in peace.
4. Build the message (`nudgeMessage` + `pickReminder`) and send plain text.
5. On success, `claimNudge` records the nudge AND stamps `lastNudgeAt`, in one
   transaction. The `unique(userId, scheduledFor)` index is the idempotency lock
   (`scheduledFor` is the local date anchored at UTC midnight — see
   `nudge.service.ts`).

One user failing is caught and never stops the rest of the batch.

`/now` reuses the exact same `buildNudgeView` + `claimNudge` path: a user who
pulls their nudge early "claims" the cycle (records it + advances `lastNudgeAt`),
so the scheduler then skips them — mirroring ayah's `/today`. The rotation only
advances when the user taps «تواصلت ✅» (sets `lastContactedAt = now`), which
naturally moves that person to the back; «تخطّي» and «فكّرني بعدين» never mark
contacted, so the same person stays next.

`/list` is an interactive browser, not static text: it renders the circle
sorted by `sortByContactPriority` (most-due first), one tappable button per
person (label = name · compact last-contacted), paginated `PAGE_SIZE` (8) at a
time with «‹ السابق»/«التالي ›» (`tw:list:<page>`). Tapping a person
(`tw:person:<id>`) edits the message into a detail card (name · last-contacted ·
their cadence) with «تواصلت» (`tw:pcontact:<id>`), «⏱️ كل كم نذكّرك؟»
(`tw:pcad:<id>`, which opens a per-relative cadence picker whose options set
`tw:pcadset:<id>:<days>`), «إزالة» (the shared `tw:rm:<id>` flow), and «‹ رجوع
للقائمة». The detail «تواصلت» runs the SAME `markContacted` + `logAction`
(`'contacted'`) as the nudge button — via the shared `recordContacted` helper —
but deliberately does NOT `claimNudge`: it just records the good deed, so the
daily nudge keeps its own rhythm. Because both the list and the rotation sort by
`lastContactedAt`, marking contacted drops that person to the back of both.

The visible commands and their handlers live in `src/bot.ts`; the inline
keyboards (and their callback-data prefixes) live in `src/lib/keyboards.ts`; the
bare-text pending-input flows (currently just the `/add` name) live in
`src/lib/pending.ts`. `/forget` deletes the `User` row, which cascades to people
and nudge logs.

## Golden rules

1. **Authentic content only.** The reminders in
   `src/database/reference/reminders.ts` are Islamic text (hadith, ayat). Never
   hand-edit, paraphrase, add to, or reorder them, and never invent a source.
   They are positive/encouraging by design — no guilt or punishment framing,
   ever, anywhere in the copy.
2. **Keep `core` pure.** No database or network imports there, and no
   `new Date()` deep inside a pure function — take `now` as an argument. That is
   what keeps it easy to test.
3. **Plain text sends, never Markdown or HTML parse_mode.** Quran/hadith glyphs
   would make a parsed message fail with a 400. See `src/lib/send.ts`.
4. **One nudge per cycle.** The `unique(userId, scheduledFor)` index on
   `NudgeLog` is the lock (`scheduledFor` is the user's local-date key). Do not
   work around it. Mirrors ayah's `DeliveryLog`.
5. **Fair rotation.** Advance the rotation by updating a person's
   `lastContactedAt` only after a real, acknowledged contact. Never skip people.

## Conventions

- TypeScript, ESM, strict mode.
- Prisma models are PascalCase, fields camelCase, with `@map`/`@@map` to
  snake_case tables and columns. We do NOT use Prisma enums; a short string
  field with a comment listing the allowed values is enough (e.g.
  `NudgeLog.action`: nudged, contacted, snoozed, skipped).
- Comments explain WHY, not what. Match the density already in the files.
- Tests use vitest. Add tests for new logic, including edge cases.

## Common commands

```bash
pnpm install
pnpm db:deploy   # apply migrations (create tables)
pnpm db:seed     # no-op (reminders live in code)
pnpm dev         # run the bot with reload (NODE_ENV=development)
pnpm test        # all tests
pnpm check       # typecheck + lint + test (run before pushing)
pnpm db:studio   # browse the database
```

### Changing the schema

Edit `prisma/schema.prisma`, then `pnpm db:migrate` (creates and applies a
migration). Commit the new folder under `prisma/migrations/`. Production applies
it with `pnpm db:deploy`.

## Gotchas

- There is ONE `.env`, at the repo root. Code and scripts load it through
  `loadEnv()` (re-exported from the kernel in `src/core/env.ts`).
  `prisma.config.ts` has the same loader inline (the Prisma CLI loads that file
  on its own, so it cannot import from core).
- `NODE_ENV` defaults to `production`. `pnpm dev` sets `NODE_ENV=development`
  itself, so local work always runs in development mode no matter what `.env`
  says.
- Prisma 7 does not read `.env` on its own and does not take the URL in the
  schema. The CLI gets the URL from `prisma.config.ts`; the running bot builds
  its own client in `src/database/client.ts`.
- The generated Prisma client lives in `src/database/generated`. It is
  git-ignored. Run `pnpm db:generate` if imports from it fail.
- Quiet hours and cadence math always take `now` as an argument so they can be
  tested. Do not call `new Date()` deep inside pure functions.

## Where things live

- Shared kernel (schedule, days, arabic, env, logger, send): the
  `telegram-bot-kit` package; the matching `src/core/*` and
  `src/lib/{send,logger}.ts` files are re-export shims.
- Rotation logic: `src/core/rotation.ts`
- Eligibility / cadence / quiet-hours: `src/core/eligibility.ts`
- Reminder picker: `src/core/reminders.ts`
- Reminder content (authentic, do not edit): `src/database/reference/reminders.ts`
- Message wording (Arabic): `src/lib/copy.ts`
- Nudge build + send + claim: `src/lib/deliver.ts`
- Database services: `src/database/services/{user,person,nudge}.service.ts`
- Commands + callbacks: `src/bot.ts`
- Inline keyboards + callback-data prefixes: `src/lib/keyboards.ts`
- Bare-text pending input (currently just the `/add` name): `src/lib/pending.ts`
- Per-minute scheduler + running-lock: `src/scheduler.ts`
- Boot (config → bot → scheduler → health, graceful shutdown): `src/index.ts`

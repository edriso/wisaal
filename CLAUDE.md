# CLAUDE.md

Notes for anyone (human or AI) working in this repo. Easy English on purpose.
The aim is that a junior developer can read this and be productive.

## What this is

Tawasul is a Telegram bot for **صلة الرحم** (keeping ties with relatives). For
each user it keeps a private circle of relatives and, on the user's chosen
cadence and outside their quiet hours, nudges them to reach out to ONE relative
at a time — rotating fairly so no one is forgotten — with a warm, authentic
encouragement. Arabic-only (modern standard Arabic, the same warm voice as the
`ayah` and `tilawah` bots, NOT dialect).

It is one small TypeScript project, everything under `src/`:

- `src/core` — pure logic, no database, no network. Fully unit-tested.
- `src/database` — the Prisma client and the database services. Reference
  content (the reminders) lives in `src/database/reference`.
- `src/` (bot.ts, scheduler.ts, lib/, …) — the grammY bot and the nudge
  scheduler. **These arrive in phase 2.** `prisma/` holds the schema and
  migrations.

The cross-bot kernel lives in **`telegram-bot-kit`** (a separate public repo,
pinned by git tag in `package.json`): timezone/schedule math, the active-day
bitmask, Arabic-Indic digits, the root `.env` loader, the logger, and the
plain-text send wrapper. The matching files here
(`src/core/{schedule,days,arabic,env}.ts`, `src/lib/{send,logger}.ts`) are
one-line re-export shims, so the shared code lives (and is tested) once, in the
kernel. To change that code: edit the kernel, tag a new version, and bump the
pin here. The `ayah` and `tilawah` bots consume the same kernel.

## How a nudge gets decided

Two pure functions in `src/core` carry the logic (both take `now` as an
argument, so every case is testable):

1. `isNudgeDue({ now, user, lastNudgeAt })` (`eligibility.ts`) — due ONLY if the
   user is not paused, not blocked, not currently snoozed, the user's local hour
   is OUTSIDE their quiet window (which may wrap past midnight), AND enough whole
   local days have passed since the last nudge (cadence; boundary inclusive), or
   they were never nudged.
2. `pickNextPerson(people, now?)` (`rotation.ts`) — the next relative is the one
   contacted longest ago; a never-contacted person always comes first; ties
   break by `createdAt` then `id`.

The reminder paired with each nudge is chosen by `pickReminder(now, index?)`
(`reminders.ts`), deterministic by UTC day.

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
pnpm db:seed     # no-op for now (reminders live in code)
pnpm dev         # run the bot with reload (phase 2)
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

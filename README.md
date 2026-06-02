# Tawasul (تواصل)

A small Telegram bot for **صلة الرحم** — keeping ties with your relatives.

Tawasul gently nudges you, on a rhythm you choose, to reach out to **one
relative at a time**, rotating fairly through your circle so no one is
forgotten. Each nudge carries a warm, authentic encouragement (a hadith, an
ayah, or a kind word). It never guilts or pressures — صلة الرحم is mercy and
love, and the bot speaks that way.

It is one small TypeScript project, with everything under `src/`:

- `src/core` — pure logic, no database, no network. Fully unit-tested.
- `src/database` — the Prisma client and (in later phases) the database
  services. Reference content (the reminders) lives in
  `src/database/reference`.
- `src/` (bot, scheduler, lib/, …) — the grammY bot and the nudge scheduler.
  _These arrive in phase 2._

The cross-bot kernel lives in **`telegram-bot-kit`** (a separate public repo,
pinned by git tag in `package.json`): the timezone/schedule math, the
active-day helpers, Arabic-Indic digits, the root `.env` loader, the logger,
and the plain-text send wrapper. The matching files here
(`src/core/{schedule,days,arabic,env}.ts`, `src/lib/{send,logger}.ts`) are
one-line re-export shims, so the shared code lives (and is tested) once, in the
kernel. The `ayah` and `tilawah` bots consume the same kernel.

## How it works

Each user keeps a private **circle** of relatives. On their chosen **cadence**
(daily, every few days, or weekly), and only outside their **quiet hours**, the
bot picks the person they have gone longest without contacting — always a
never-contacted person first — and sends a gentle nudge. The user can mark
**contacted**, **snooze**, or **skip**, and the rotation moves on. One nudge per
cycle, enforced by a unique `(user, local-date)` lock just like ayah.

## Commands (planned)

| Command     | What it does                                   |
| ----------- | ---------------------------------------------- |
| `/start`    | Onboarding: set up your circle                 |
| `/add`      | Add a relative to your circle                  |
| `/list`     | Show your circle                               |
| `/remove`   | Remove someone from your circle                |
| `/now`      | Nudge me right now about whoever is next       |
| `/settings` | View and change cadence, quiet hours, timezone |
| `/pause`    | Pause nudges (and `/resume` to come back)      |
| `/forget`   | Reset the rotation                             |
| `/shukr`    | Jot down a moment of gratitude                 |
| `/help`     | Show the command list                          |

Phase 2 wires these up.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in BOT_TOKEN and DATABASE_URL
pnpm db:deploy         # apply migrations (create tables)
pnpm db:seed           # no-op for now (reminders live in code)
pnpm dev               # run the bot with reload (phase 2)
pnpm test              # all tests
pnpm check             # typecheck + lint + test (run before pushing)
pnpm db:studio         # browse the database
```

There is ONE `.env`, at the repo root. Code and scripts load it through
`loadEnv()` (from the kernel); `prisma.config.ts` has the same loader inline.

## License

0BSD. See `LICENSE`.

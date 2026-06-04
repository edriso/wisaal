# Wisaal (وصال)

A small Telegram bot for **صلة الرحم** (keeping ties with your relatives).

Wisaal gently nudges you, on a rhythm you choose, to reach out to **one
relative at a time**, rotating fairly through your circle so no one is
forgotten. Each nudge carries a warm, authentic encouragement (a hadith, an
ayah, or a kind word). It never guilts or pressures; صلة الرحم is mercy and
love, and the bot speaks that way.

It is one small TypeScript project, with everything under `src/`:

- `src/core`: pure logic, no database, no network. Fully unit-tested.
- `src/database`: the Prisma client and (in later phases) the database
  services. Reference content (the reminders) lives in
  `src/database/reference`.
- `src/` (bot, scheduler, lib/, …): the grammY bot, the database services, and
  the per-minute nudge scheduler.

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
bot picks the person they have gone longest without contacting (always a
never-contacted person first) and sends a gentle nudge. The user can mark
**contacted**, **snooze**, or **skip**, and the rotation moves on. One nudge per
cycle, enforced by a unique `(user, local-date)` lock just like ayah.

When a nudge arrives it carries three inline buttons:

- **«تواصلت ✅»**: you reached out. The person moves to the back of the rotation
  (their `lastContactedAt` is set to now) and the bot replies warmly.
- **«فكّرني بعدين ⏰»**: snooze about a day; the next cycle is skipped softly.
- **«تخطّي»**: skip this one with no pressure; the same person stays next.

`/list` is an interactive browser of your circle, sorted by who you have gone
longest without reaching (the same order the nudge picks). Tap a name to open a
small detail card (their relation and last contact) where you can mark
«تواصلت ✅» proactively (which records the contact and drops them to the back of
both the list and the rotation, without touching the daily nudge rhythm) or
remove them. Long circles paginate eight at a time.

## Commands

| Command     | What it does                                       |
| ----------- | -------------------------------------------------- |
| `/start`    | Warm onboarding + privacy note; prompts you to add |
| `/add`      | `/add <name> [relation]`, or send the name next    |
| `/list`     | Interactive, sorted browser of your circle (most-due first); tap a name to see their last contact and mark «تواصلت» or remove (paginated) |
| `/remove`   | Inline buttons to remove someone                   |
| `/now`      | Nudge me right now about whoever is next           |
| `/settings` | Cadence, quiet hours, and pause/resume (buttons)   |
| `/pause`    | Pause nudges (and `/resume` to come back)          |
| `/shukr`    | Opt-in gratitude journal (off by default)          |
| `/forget`   | Wipe ALL your data (confirm first)                 |
| `/help`     | Show the command list                              |

Admin-only (set `ADMIN_TELEGRAM_ID`): `/admin_health`, `/admin_send` (fire one
nudge batch by hand, the same path the cron uses).

## Get a bot token

Open **@BotFather** in Telegram, send `/newbot` (or `/mybots` for an existing
one), follow the prompts, and copy the token it gives you. Put it in `.env` as
`BOT_TOKEN`. Treat it like a password.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in BOT_TOKEN and DATABASE_URL (see comments there)
pnpm db:deploy         # apply migrations (create tables)
pnpm db:seed           # no-op (reminders live in code)
pnpm dev               # run the bot with reload (NODE_ENV=development)
pnpm test              # all tests
pnpm check             # typecheck + lint + test (run before pushing)
pnpm db:studio         # browse the database
```

There is ONE `.env`, at the repo root. Code and scripts load it through
`loadEnv()` (from the kernel); `prisma.config.ts` has the same loader inline.

## Deploy

CI/CD lives in `.github/workflows/deploy.yml`. On every push and PR to `main` the
**test** job runs `pnpm check`. On a push to `main`, the **deploy** job SSHes to
the VPS, pulls `/opt/bots/telegram/wisaal`, and runs
`docker compose up -d --build wisaal` (then prunes old images). It activates
once the `SERVER_IP` and `SSH_KEY` GitHub secrets are set and `wisaal` is added
to the VPS `docker compose` file. Apply migrations there with `pnpm db:deploy`
(idempotent) the first time and whenever the schema changes, e.g. via a
`wisaal-migrate` one-off compose service like ayah's.

## License

0BSD. See `LICENSE`.

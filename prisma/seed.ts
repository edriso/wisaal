// Database seed.
//
// Wisaal has no read-only reference tables to fill: the reminders are static
// content shipped in code (src/database/reference/reminders.ts), and every
// other row (users, people, nudges) is created by real users at
// runtime. So there is nothing to seed for a fresh database — this script is a
// no-op placeholder, kept so `pnpm db:seed` and `pnpm db:reset` work and so
// later phases have an obvious home for any seed data they introduce.

async function main(): Promise<void> {
  console.log('wisaal: no seed data required (reminders live in code). Nothing to do.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

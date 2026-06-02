// Public surface of the database package: the Prisma client, the model
// types, and the reference data. Services land here in phase 2.

export { prisma } from './client';

// Generated model types, re-exported so the app imports them from one place.
export type { User, Person, NudgeLog, ShukrEntry } from './generated/prisma/client';

// Reference data
export * from './reference/reminders';

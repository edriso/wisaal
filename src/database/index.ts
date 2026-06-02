// Public surface of the database package: the Prisma client, the model
// types, the services the bot calls, and the reference data.

export { prisma } from './client';

// Generated model types, re-exported so the app imports them from one place.
export type { User, Person, NudgeLog, ShukrEntry } from './generated/prisma/client';

// Services
export * from './services/user.service';
export * from './services/person.service';
export * from './services/nudge.service';
export * from './services/shukr.service';

// Reference data
export * from './reference/reminders';

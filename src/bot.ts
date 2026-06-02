import { Bot, type Context } from 'grammy';
import {
  getOrCreateUser,
  updateSettings,
  setPaused,
  setSnooze,
  setShukrEnabled,
  forgetUser,
  addPerson,
  listPeople,
  removePerson,
  markContacted,
  claimNudge,
  logAction,
  addShukr,
  type User,
  type RotationPerson,
} from './database';
import { config } from './config';
import { logger } from './lib/logger';
import {
  COPY,
  settingsSummary,
  personLabel,
  lastContactedAr,
  quietWindowAr,
  cadenceSummaryAr,
} from './lib/copy';
import { buildNudgeView, type NudgeUser } from './lib/deliver';
import { runNudgeOnce } from './scheduler';
import {
  buildNudgeKeyboard,
  buildRemoveKeyboard,
  buildCadenceKeyboard,
  buildQuietKeyboard,
  buildSettingsKeyboard,
  buildShukrKeyboard,
  buildForgetKeyboard,
  ACTION_PREFIX,
  ACTION_CONTACTED,
  ACTION_SNOOZE,
  ACTION_SKIP,
  REMOVE_PREFIX,
  CADENCE_PREFIX,
  CADENCE_OPTIONS,
  QUIET_PREFIX,
  QUIET_OPTIONS,
  PAUSE_TOGGLE,
  SHUKR_TOGGLE,
  FORGET_CONFIRM,
  FORGET_CANCEL,
} from './lib/keyboards';
import { takePending, setPending, clearPending } from './lib/pending';

const bot = new Bot<Context>(config.botToken);

// "Remind me later" pushes the next nudge out by roughly one day. isNudgeDue
// suppresses nudges while snoozeUntil is ahead of now, so this is a soft skip
// of one cycle, not a pause.
const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Make sure we have a user row for whoever sent this update. */
async function userFor(ctx: Context): Promise<User | null> {
  if (!ctx.from) return null;
  return getOrCreateUser(BigInt(ctx.from.id), config.defaultTimezone);
}

/**
 * Swallow Telegram's "message is not modified" 400 (a stale or double-tapped
 * button re-rendering the same content) and rethrow anything else.
 */
function ignoreNotModified(err: unknown): void {
  const description = (err as { description?: string }).description ?? '';
  if (!description.includes('message is not modified')) throw err;
}

/** Admin gate: a private-chat message from the one configured admin id. */
function isAdmin(ctx: Context): boolean {
  if (config.adminTelegramId === null) return false;
  if (ctx.chat?.type !== 'private') return false;
  return ctx.from ? BigInt(ctx.from.id) === config.adminTelegramId : false;
}

/** Get the text after a "/command" (e.g. the name in "/add خالتي فاطمة"). */
function commandArg(ctx: Context, command: string): string | null {
  const raw = ctx.message?.text ?? '';
  const stripped = raw.replace(new RegExp(`^/${command}(@\\S+)?\\s*`), '').trim();
  return stripped === '' ? null : stripped;
}

/** Parse a free-text "<name> [relation...]" / "<relation> <name>" addition.
 *  We keep it forgiving: the whole text is the display label. A leading word
 *  that reads like a relation is allowed but not required, so we simply store
 *  the first token as the (optional) relation when there is more than one
 *  word, and the rest as the name. This matches the copy hint "خالتي فاطمة". */
function parsePersonInput(text: string): { name: string; relation: string | null } | null {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed === '') return null;
  const parts = trimmed.split(' ');
  if (parts.length === 1) return { name: parts[0], relation: null };
  return { name: parts.slice(1).join(' '), relation: parts[0] };
}

// ─── Nudge build + send + claim (shared by /now and the scheduler path) ──

/** Map a User row to the shape buildNudgeView / isNudgeDue need. */
function toNudgeUser(user: User): NudgeUser {
  return {
    id: user.id,
    telegramId: user.telegramId,
    timezone: user.timezone,
    cadenceDays: user.cadenceDays,
    quietStartHour: user.quietStartHour,
    quietEndHour: user.quietEndHour,
    snoozeUntil: user.snoozeUntil,
    paused: user.paused,
    blocked: user.blocked,
    lastNudgeAt: user.lastNudgeAt,
  };
}

/**
 * Send a nudge view's message with its action buttons and, if it carries a
 * claim, record it as this cycle's nudge so the scheduler does not nudge again.
 * The claim is committed only AFTER the message is shown, so a failed reply
 * leaves the cycle unclaimed; the unique (user, local-date) index makes it safe
 * even if the scheduler races. Mirrors ayah's sendTodayView. Shared by /now.
 */
async function sendNudgeView(
  ctx: Context,
  user: User,
  view: Awaited<ReturnType<typeof buildNudgeView>>,
  now: Date,
): Promise<void> {
  if (!view.message || !view.person) return;
  if (view.alreadyNudged) await ctx.reply(COPY.nowAlready);
  await ctx.reply(view.message, { reply_markup: buildNudgeKeyboard(view.person.id) });
  if (view.claim) {
    await claimNudge({
      userId: user.id,
      personId: view.claim.personId,
      scheduledFor: view.claim.scheduledFor,
      now,
    });
  }
}

// ─── Commands ────────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  clearPending(BigInt(ctx.from!.id));
  // A brand-new user (no people yet) gets the warm onboarding; a returning one
  // gets a short greeting with their settings. We tell them apart by whether
  // they have ever added anyone.
  const people = await listPeople(user.id);
  if (people.length === 0) {
    await ctx.reply(COPY.welcomeNew);
    return;
  }
  await ctx.reply(COPY.welcome(settingsSummary(user)));
});

bot.command('help', (ctx) => ctx.reply(COPY.help));

// /add <name> [relation]: add a relative. With no argument, prompt and accept
// the next plain message as the name (see the message handler below).
bot.command('add', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  const arg = commandArg(ctx, 'add');
  if (!arg) {
    setPending(BigInt(ctx.from!.id), 'add-name');
    await ctx.reply(COPY.addPrompt);
    return;
  }
  const parsed = parsePersonInput(arg);
  if (!parsed) {
    await ctx.reply(COPY.addEmpty);
    return;
  }
  await addPerson(user.id, parsed.name, parsed.relation);
  await ctx.reply(COPY.addedOne(personLabel(parsed.name, parsed.relation)));
});

// /list: the user's circle plus when they last reached out to each.
bot.command('list', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  const people = await listPeople(user.id);
  if (people.length === 0) {
    await ctx.reply(COPY.listEmpty);
    return;
  }
  const now = new Date();
  const lines = people.map((p) =>
    COPY.listLine(
      personLabel(p.name, p.relation),
      lastContactedAr(p.lastContactedAt, user.timezone, now),
    ),
  );
  await ctx.reply([COPY.listHeader, '', ...lines].join('\n'));
});

// /remove: inline buttons to pick whom to remove.
bot.command('remove', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  const people = await listPeople(user.id);
  if (people.length === 0) {
    await ctx.reply(COPY.removeEmpty);
    return;
  }
  await ctx.reply(COPY.removePrompt, { reply_markup: buildRemoveKeyboard(people) });
});

// /now: nudge me right now about whoever is next. Pulling it early COUNTS as
// this cycle's nudge (we record it and advance lastNudgeAt), so the scheduler
// skips the user this cycle — exactly like ayah's /today.
bot.command('now', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  const people = await listPeople(user.id);
  if (people.length === 0) {
    await ctx.reply(COPY.nowNoPeople);
    return;
  }
  const now = new Date();
  const view = await buildNudgeView(toNudgeUser(user), people, now, { claimable: true });
  await sendNudgeView(ctx, user, view, now);
});

// /settings: show the summary with inline controls.
bot.command('settings', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  await ctx.reply(settingsSummary(user), {
    reply_markup: buildSettingsKeyboard(user.paused),
  });
});

// /pause and /resume: explicit break controls (the settings toggle mirrors them).
bot.command('pause', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  if (user.paused) {
    await ctx.reply(COPY.alreadyPaused);
    return;
  }
  await setPaused(user.id, true);
  await ctx.reply(COPY.paused);
});

bot.command('resume', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  if (!user.paused) {
    await ctx.reply(COPY.alreadyActive);
    return;
  }
  await setPaused(user.id, false);
  await ctx.reply(COPY.resumed);
});

// /shukr: opt-in gratitude touch. First run shows the toggle; once enabled the
// next plain message is saved as a gratitude note.
bot.command('shukr', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  const arg = commandArg(ctx, 'shukr');
  if (arg && user.shukrEnabled) {
    // Allow "/shukr <text>" inline when already enabled.
    await addShukr(user.id, arg);
    await ctx.reply(COPY.shukrSaved);
    return;
  }
  if (user.shukrEnabled) setPending(BigInt(ctx.from!.id), 'shukr-text');
  await ctx.reply(COPY.shukrIntro(user.shukrEnabled), {
    reply_markup: buildShukrKeyboard(user.shukrEnabled),
  });
});

// /forget: wipe ALL of the user's data, behind an explicit confirm.
bot.command('forget', async (ctx) => {
  const user = await userFor(ctx);
  if (!user) return;
  await ctx.reply(COPY.forgetPrompt, { reply_markup: buildForgetKeyboard() });
});

// ─── Nudge action buttons ────────────────────────────────────────────

// «تواصلت ✅» — mark contacted now (moves them to the back of the rotation
// naturally) and acknowledge warmly. ONE markContacted, ONE answer.
bot.callbackQuery(new RegExp(`^${ACTION_PREFIX}${ACTION_CONTACTED}:(\\d+)$`), async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const personId = Number(ctx.match![1]);
  const updated = await markContacted(user.id, personId, new Date());
  if (updated) await logAction(user.id, personId, 'contacted');
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // drop the buttons
  await ctx.reply(COPY.contacted);
  await ctx.answerCallbackQuery();
});

// «فكّرني بعدين ⏰» — snooze about one day.
bot.callbackQuery(new RegExp(`^${ACTION_PREFIX}${ACTION_SNOOZE}:(\\d+)$`), async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const personId = Number(ctx.match![1]);
  await setSnooze(user.id, new Date(Date.now() + SNOOZE_MS));
  await logAction(user.id, personId, 'snoozed');
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.reply(COPY.snoozed);
  await ctx.answerCallbackQuery();
});

// «تخطّي» — log a skip and gently move on. We do NOT mark contacted, so the
// same person stays next in the rotation for the following cycle.
bot.callbackQuery(new RegExp(`^${ACTION_PREFIX}${ACTION_SKIP}:(\\d+)$`), async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const personId = Number(ctx.match![1]);
  await logAction(user.id, personId, 'skipped');
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.reply(COPY.skipped);
  await ctx.answerCallbackQuery();
});

// ─── Remove-person buttons ───────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${REMOVE_PREFIX}(\\d+)$`), async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const personId = Number(ctx.match![1]);
  const before = await listPeople(user.id);
  const target = before.find((p) => p.id === personId);
  const removed = await removePerson(user.id, personId);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  if (removed && target) {
    await ctx.reply(COPY.removedOne(personLabel(target.name, target.relation)));
  }
  await ctx.answerCallbackQuery();
});

// ─── Cadence buttons ─────────────────────────────────────────────────

// Opening the cadence picker from /settings.
bot.callbackQuery(`${CADENCE_PREFIX}open`, async (ctx) => {
  await ctx.reply(COPY.cadencePrompt, { reply_markup: buildCadenceKeyboard() });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(new RegExp(`^${CADENCE_PREFIX}(\\d+)$`), async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const days = Number(ctx.match![1]);
  if (!(CADENCE_OPTIONS as readonly number[]).includes(days)) {
    await ctx.answerCallbackQuery();
    return;
  }
  await updateSettings(user.id, { cadenceDays: days });
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.reply(COPY.cadenceUpdated(cadenceSummaryAr(days)));
  await ctx.answerCallbackQuery();
});

// ─── Quiet-hours buttons ─────────────────────────────────────────────

bot.callbackQuery(`${QUIET_PREFIX}open`, async (ctx) => {
  await ctx.reply(COPY.quietPrompt, { reply_markup: buildQuietKeyboard() });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(new RegExp(`^${QUIET_PREFIX}(\\d{1,2}):(\\d{1,2})$`), async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const start = Number(ctx.match![1]);
  const end = Number(ctx.match![2]);
  const known = QUIET_OPTIONS.some((o) => o.start === start && o.end === end);
  if (!known || start > 23 || end > 23) {
    await ctx.answerCallbackQuery();
    return;
  }
  await updateSettings(user.id, { quietStartHour: start, quietEndHour: end });
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.reply(COPY.quietUpdated(quietWindowAr(start, end)));
  await ctx.answerCallbackQuery();
});

// ─── Pause/resume toggle (settings) ──────────────────────────────────

bot.callbackQuery(PAUSE_TOGGLE, async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const wasPaused = user.paused;
  await setPaused(user.id, !wasPaused);
  // Re-render the settings card so the status line and button reflect the new
  // state. A fresh read reflects the row we just updated.
  const fresh = await userFor(ctx);
  if (fresh) {
    await ctx
      .editMessageText(settingsSummary(fresh), {
        reply_markup: buildSettingsKeyboard(fresh.paused),
      })
      .catch(ignoreNotModified);
  }
  await ctx.answerCallbackQuery({ text: wasPaused ? '▶️ عادت التذكيرات' : '⏸️ تم الإيقاف' });
});

// ─── Shukr toggle ────────────────────────────────────────────────────

bot.callbackQuery(SHUKR_TOGGLE, async (ctx) => {
  const user = await userFor(ctx);
  if (!user) {
    await ctx.answerCallbackQuery();
    return;
  }
  const enable = !user.shukrEnabled;
  await setShukrEnabled(user.id, enable);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  if (enable) {
    setPending(BigInt(ctx.from!.id), 'shukr-text');
    await ctx.reply(COPY.shukrEnabled);
  } else {
    clearPending(BigInt(ctx.from!.id));
    await ctx.reply(COPY.shukrDisabled);
  }
  await ctx.answerCallbackQuery();
});

// ─── Forget confirm / cancel ─────────────────────────────────────────

bot.callbackQuery(FORGET_CONFIRM, async (ctx) => {
  if (!ctx.from) {
    await ctx.answerCallbackQuery();
    return;
  }
  const telegramId = BigInt(ctx.from.id);
  clearPending(telegramId);
  const deleted = await forgetUser(telegramId);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.reply(deleted > 0 ? COPY.forgetDone : COPY.forgetNothing);
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(FORGET_CANCEL, async (ctx) => {
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.reply(COPY.forgetCancelled);
  await ctx.answerCallbackQuery();
});

// ─── Plain-text pending input (the /add name, the /shukr note) ────────

bot.on('message:text', async (ctx) => {
  // A "/command" is handled above; ignore anything that looks like one here so
  // an unmatched command does not get swallowed as pending input.
  if (ctx.message.text.startsWith('/')) {
    await ctx.reply(COPY.fallback);
    return;
  }
  if (!ctx.from) return;
  const telegramId = BigInt(ctx.from.id);
  const kind = takePending(telegramId);
  if (!kind) {
    await ctx.reply(COPY.fallback);
    return;
  }
  const user = await userFor(ctx);
  if (!user) return;

  if (kind === 'add-name') {
    const parsed = parsePersonInput(ctx.message.text);
    if (!parsed) {
      await ctx.reply(COPY.addEmpty);
      return;
    }
    await addPerson(user.id, parsed.name, parsed.relation);
    await ctx.reply(COPY.addedOne(personLabel(parsed.name, parsed.relation)));
    return;
  }

  // shukr-text. Guard against the rare case the user disabled it meanwhile.
  if (!user.shukrEnabled) {
    await ctx.reply(COPY.shukrNotEnabled);
    return;
  }
  await addShukr(user.id, ctx.message.text.trim());
  await ctx.reply(COPY.shukrSaved);
});

// ─── Admin commands ──────────────────────────────────────────────────

bot.command('admin_health', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const uptime = Math.floor(process.uptime());
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  await ctx.reply(
    [
      'Health',
      '------',
      `Uptime: ${days}d ${hours}h ${mins}m`,
      `Now: ${new Date().toISOString()}`,
    ].join('\n'),
  );
});

// /admin_send: fire the nudge batch by hand, the exact path the cron uses.
bot.command('admin_send', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const stats = await runNudgeOnce(bot);
  if (!stats) {
    await ctx.reply('A nudge run is already in progress. Try again in a moment.');
    return;
  }
  await ctx.reply(
    `Nudge run done.\nDue: ${stats.due}\nSent: ${stats.sent}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}`,
  );
});

bot.catch((err) => {
  logger.error('Bot error', { error: String(err.error), update: err.ctx.update.update_id });
});

async function setBotCommands() {
  await bot.api.setMyCommands([
    { command: 'now', description: 'تذكير فوري بمن يأتي دوره' },
    { command: 'add', description: 'إضافة شخص إلى دائرتك' },
    { command: 'list', description: 'عرض دائرتك' },
    { command: 'remove', description: 'إزالة شخص من دائرتك' },
    { command: 'settings', description: 'ضبط الإيقاع وساعات الهدوء' },
    { command: 'pause', description: 'إيقاف التذكيرات مؤقتًا' },
    { command: 'resume', description: 'استئناف التذكيرات' },
    { command: 'shukr', description: 'تدوين لحظة امتنان' },
    { command: 'forget', description: 'محو كل بياناتك' },
    { command: 'help', description: 'المساعدة' },
  ]);
}

export { bot, setBotCommands, parsePersonInput, toNudgeUser };
export type { RotationPerson };

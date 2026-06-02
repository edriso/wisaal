import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Handler-level tests. They drive the REAL grammY dispatch (bot.handleUpdate)
// against mocked services, so each handler's wiring is exercised end to end.
// This guards the self-recursion / double-call class of bug this bot family
// once shipped: a handler that accidentally calls itself or fires its core
// action twice would show up here even though typecheck and the unit tests
// stay green.
//
// bot.ts builds a grammY Bot and wires every command at import, so we mock the
// modules that would touch the network, the database, or env at load time.
const h = vi.hoisted(() => ({
  getOrCreateUser: vi.fn(),
  listPeople: vi.fn(),
  addPerson: vi.fn(),
  removePerson: vi.fn(),
  markContacted: vi.fn(),
  setPersonCadence: vi.fn(),
  setSnooze: vi.fn(),
  setPaused: vi.fn(),
  setShukrEnabled: vi.fn(),
  forgetUser: vi.fn(),
  claimNudge: vi.fn(),
  logAction: vi.fn(),
  addShukr: vi.fn(),
  updateSettings: vi.fn(),
  buildNudgeView: vi.fn(),
}));

vi.mock('./config', () => ({
  config: {
    botToken: 'test-token',
    databaseUrl: 'mysql://t:t@localhost:3306/t',
    defaultTimezone: 'Africa/Cairo',
    adminTelegramId: null,
    isDev: true,
  },
}));
vi.mock('./database', () => ({
  getOrCreateUser: h.getOrCreateUser,
  listPeople: h.listPeople,
  addPerson: h.addPerson,
  removePerson: h.removePerson,
  markContacted: h.markContacted,
  setPersonCadence: h.setPersonCadence,
  setSnooze: h.setSnooze,
  setPaused: h.setPaused,
  setShukrEnabled: h.setShukrEnabled,
  forgetUser: h.forgetUser,
  claimNudge: h.claimNudge,
  logAction: h.logAction,
  addShukr: h.addShukr,
  updateSettings: h.updateSettings,
}));
vi.mock('./lib/deliver', () => ({ buildNudgeView: h.buildNudgeView }));
vi.mock('./scheduler', () => ({ runNudgeOnce: vi.fn() }));
vi.mock('./lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { Update } from 'grammy/types';
import { bot, parsePersonInput } from './bot';

const USER = {
  id: 1,
  telegramId: 555n,
  timezone: 'Africa/Cairo',
  cadenceDays: 3,
  quietStartHour: 22,
  quietEndHour: 8,
  snoozeUntil: null,
  paused: false,
  blocked: false,
  shukrEnabled: false,
  lastNudgeAt: null,
};

// Capture every outgoing API call so we can assert what the handler sent
// without any network. grammY routes ctx.reply through bot.api.sendMessage and
// callback answers through bot.api.answerCallbackQuery.
let apiCalls: Array<{ method: string; payload: Record<string, unknown> }>;

beforeAll(() => {
  // Set botInfo by hand so handleUpdate can dispatch without a network init().
  // Cast through unknown: the exact UserFromGetMe shape gains fields between
  // grammY versions, and dispatch only reads id/username here.
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: 'wisaal',
    username: 'wisaal_bot',
  } as unknown as typeof bot.botInfo;
});

beforeEach(() => {
  vi.clearAllMocks();
  apiCalls = [];
  h.getOrCreateUser.mockResolvedValue(USER);
  h.listPeople.mockResolvedValue([
    { id: 10, name: 'فاطمة', relation: 'خالتي', lastContactedAt: null, createdAt: new Date() },
  ]);
  h.markContacted.mockResolvedValue(true);
  h.setPersonCadence.mockResolvedValue(true);
  h.removePerson.mockResolvedValue(true);
  h.claimNudge.mockResolvedValue('nudged');
  h.buildNudgeView.mockResolvedValue({
    message: 'نص التذكير',
    person: { id: 10, name: 'فاطمة', relation: 'خالتي' },
    claim: { scheduledFor: '2026-06-02', personId: 10 },
    alreadyNudged: false,
  });

  // Intercept the transformer chain at the API boundary.
  bot.api.config.use((_prev, method, payload) => {
    apiCalls.push({ method, payload: payload as Record<string, unknown> });
    // Minimal truthy result so grammY's ctx helpers resolve.
    return Promise.resolve({ ok: true, result: { message_id: 1 } } as never);
  });
});

let updateId = 1;

const CHAT = { id: 555, type: 'private' as const, first_name: 'U' };

function textUpdate(text: string): Update {
  // grammY matches /commands by the message's bot_command entity, so include
  // one when the text starts with a slash (covers "/cmd args" too).
  const entities = text.startsWith('/')
    ? [{ type: 'bot_command' as const, offset: 0, length: text.split(/\s/)[0].length }]
    : undefined;
  return {
    update_id: updateId++,
    message: {
      message_id: 1,
      date: 0,
      chat: CHAT,
      from: { id: 555, is_bot: false, first_name: 'U' },
      text,
      ...(entities ? { entities } : {}),
    },
  } as Update;
}

function callbackUpdate(data: string): Update {
  return {
    update_id: updateId++,
    callback_query: {
      id: 'cb1',
      from: { id: 555, is_bot: false, first_name: 'U' },
      chat_instance: 'ci',
      data,
      message: {
        message_id: 2,
        date: 0,
        chat: CHAT,
        from: { id: 1, is_bot: true, first_name: 'bot' },
        text: 'نص التذكير',
      },
    },
  } as Update;
}

const sends = () => apiCalls.filter((c) => c.method === 'sendMessage');
const answers = () => apiCalls.filter((c) => c.method === 'answerCallbackQuery');

describe('/now', () => {
  it('builds + claims exactly once and sends the nudge (no double-call)', async () => {
    await bot.handleUpdate(textUpdate('/now'));

    expect(h.buildNudgeView).toHaveBeenCalledTimes(1);
    // Claiming exactly once is the heart of the one-per-cycle guard.
    expect(h.claimNudge).toHaveBeenCalledTimes(1);
    expect(h.claimNudge).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1, personId: 10, scheduledFor: '2026-06-02' }),
    );
    // The nudge message went out with action buttons.
    const nudge = sends().find((c) => c.payload.text === 'نص التذكير');
    expect(nudge).toBeTruthy();
    expect(nudge!.payload.reply_markup).toBeTruthy();
  });

  it('does not claim and warns when the circle is empty', async () => {
    h.listPeople.mockResolvedValue([]);
    await bot.handleUpdate(textUpdate('/now'));

    expect(h.buildNudgeView).not.toHaveBeenCalled();
    expect(h.claimNudge).not.toHaveBeenCalled();
    expect(sends().length).toBe(1); // just the "add someone first" reply
  });
});

describe('nudge action: «تواصلت ✅»', () => {
  it('marks contacted ONCE, logs it, and answers the callback once', async () => {
    await bot.handleUpdate(callbackUpdate('tw:act:contacted:10'));

    expect(h.markContacted).toHaveBeenCalledTimes(1);
    expect(h.markContacted).toHaveBeenCalledWith(1, 10, expect.any(Date));
    expect(h.logAction).toHaveBeenCalledTimes(1);
    expect(h.logAction).toHaveBeenCalledWith(1, 10, 'contacted');
    // Exactly one callback answer (no accidental double-answer / recursion).
    expect(answers().length).toBe(1);
    // A warm acknowledgement was sent.
    expect(sends().length).toBe(1);
  });
});

describe('nudge action: «فكّرني بعدين ⏰»', () => {
  it('snoozes once and logs the action', async () => {
    await bot.handleUpdate(callbackUpdate('tw:act:snooze:10'));

    expect(h.setSnooze).toHaveBeenCalledTimes(1);
    expect(h.setSnooze).toHaveBeenCalledWith(1, expect.any(Date));
    expect(h.logAction).toHaveBeenCalledWith(1, 10, 'snoozed');
    expect(h.markContacted).not.toHaveBeenCalled(); // a snooze must NOT contact
    expect(answers().length).toBe(1);
  });
});

describe('nudge action: «تخطّي»', () => {
  it('logs a skip without marking contacted (person stays next)', async () => {
    await bot.handleUpdate(callbackUpdate('tw:act:skip:10'));

    expect(h.logAction).toHaveBeenCalledWith(1, 10, 'skipped');
    expect(h.markContacted).not.toHaveBeenCalled();
    expect(h.setSnooze).not.toHaveBeenCalled();
    expect(answers().length).toBe(1);
  });
});

describe('/add', () => {
  it('adds the parsed person exactly once', async () => {
    await bot.handleUpdate(textUpdate('/add خالتي فاطمة'));
    expect(h.addPerson).toHaveBeenCalledTimes(1);
    expect(h.addPerson).toHaveBeenCalledWith(1, 'فاطمة', 'خالتي');
  });
});

describe('/forget', () => {
  it('only wipes data AFTER the confirm button, never on the command itself', async () => {
    await bot.handleUpdate(textUpdate('/forget'));
    expect(h.forgetUser).not.toHaveBeenCalled(); // command just asks to confirm

    h.forgetUser.mockResolvedValue(1);
    await bot.handleUpdate(callbackUpdate('tw:forget:yes'));
    expect(h.forgetUser).toHaveBeenCalledTimes(1);
    expect(h.forgetUser).toHaveBeenCalledWith(555n);
    expect(answers().length).toBe(1);
  });
});

describe('/remove buttons', () => {
  it('removes the chosen person once', async () => {
    await bot.handleUpdate(callbackUpdate('tw:rm:10'));
    expect(h.removePerson).toHaveBeenCalledTimes(1);
    expect(h.removePerson).toHaveBeenCalledWith(1, 10);
    expect(answers().length).toBe(1);
  });
});

// ─── Interactive /list browser + person detail ─────────────────────────

// Build N people, oldest-added first, all never-contacted unless overridden,
// so the natural sort is neglected-first (createdAt tie-break) → id order.
function people(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `شخص${i + 1}`,
    relation: null,
    cadenceDays: 7,
    lastContactedAt: null,
    createdAt: new Date(2026, 0, i + 1), // earlier-added first
  }));
}

// The buttons (callback_data) in the last sent message's inline keyboard.
function lastKeyboardData(): string[] {
  const send = sends().at(-1)!;
  const markup = send.payload.reply_markup as {
    inline_keyboard: Array<Array<{ callback_data: string }>>;
  };
  return markup.inline_keyboard.flat().map((b) => b.callback_data);
}
function lastEditData(): string[] {
  const edit = apiCalls.filter((c) => c.method === 'editMessageText').at(-1)!;
  const markup = edit.payload.reply_markup as {
    inline_keyboard: Array<Array<{ callback_data: string }>>;
  };
  return markup.inline_keyboard.flat().map((b) => b.callback_data);
}

describe('/list interactive browser', () => {
  it('renders people sorted neglected-first as one button each (no pagination row for few)', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(textUpdate('/list'));

    const data = lastKeyboardData();
    // One person-button each, most-due first (all never-contacted → createdAt
    // order → ids 1,2,3), and no pagination arrows for a single page.
    expect(data).toEqual(['tw:person:1', 'tw:person:2', 'tw:person:3']);
    // Every callback stays well within Telegram's 64-byte limit.
    for (const d of data) expect(Buffer.byteLength(d, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('a contacted person sinks below the never-contacted ones', async () => {
    const list = people(2);
    list[0].lastContactedAt = new Date(2026, 4, 1); // person 1 was contacted
    h.listPeople.mockResolvedValue(list);
    await bot.handleUpdate(textUpdate('/list'));
    // Never-contacted person 2 now leads; contacted person 1 sinks.
    expect(lastKeyboardData()).toEqual(['tw:person:2', 'tw:person:1']);
  });

  it('paginates at PAGE_SIZE (8) and shows only the «next» arrow on page 1', async () => {
    h.listPeople.mockResolvedValue(people(10));
    await bot.handleUpdate(textUpdate('/list'));

    const data = lastKeyboardData();
    const persons = data.filter((d) => d.startsWith('tw:person:'));
    expect(persons).toEqual([1, 2, 3, 4, 5, 6, 7, 8].map((i) => `tw:person:${i}`));
    // Page 1 of 2: forward only, no «previous».
    expect(data).toContain('tw:list:2');
    expect(data).not.toContain('tw:list:0');
  });

  it('page 2 shows the remaining slice and only the «previous» arrow', async () => {
    h.listPeople.mockResolvedValue(people(10));
    await bot.handleUpdate(callbackUpdate('tw:list:2'));

    const data = lastEditData();
    const persons = data.filter((d) => d.startsWith('tw:person:'));
    expect(persons).toEqual(['tw:person:9', 'tw:person:10']);
    expect(data).toContain('tw:list:1'); // back to page 1
    expect(data).not.toContain('tw:list:3'); // nothing past the last page
  });

  it('tapping a person opens the detail card with contacted / cadence / remove / back', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(callbackUpdate('tw:person:2'));

    const data = lastEditData();
    expect(data).toEqual(['tw:pcontact:2', 'tw:pcad:2', 'tw:rm:2', 'tw:list:1']);
    expect(answers().length).toBe(1);
  });

  it('opens the per-relative cadence picker, marking the current option', async () => {
    h.listPeople.mockResolvedValue(people(3)); // all default cadenceDays 7
    await bot.handleUpdate(callbackUpdate('tw:pcad:2'));

    const data = lastEditData();
    // One set-button per option (id 2), plus a back-to-detail row.
    expect(data).toEqual([
      'tw:pcadset:2:1',
      'tw:pcadset:2:3',
      'tw:pcadset:2:7',
      'tw:pcadset:2:14',
      'tw:pcadset:2:30',
      'tw:person:2',
    ]);
    expect(answers().length).toBe(1);
  });

  it('setting a relative’s cadence calls setPersonCadence once and returns to the card', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(callbackUpdate('tw:pcadset:2:30'));

    expect(h.setPersonCadence).toHaveBeenCalledTimes(1);
    expect(h.setPersonCadence).toHaveBeenCalledWith(1, 2, 30);
    // Back on the detail card (its full action row) after saving.
    expect(lastEditData()).toEqual(['tw:pcontact:2', 'tw:pcad:2', 'tw:rm:2', 'tw:list:1']);
    expect(answers().length).toBe(1);
  });

  it('ignores an out-of-range cadence value without writing', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(callbackUpdate('tw:pcadset:2:99'));
    expect(h.setPersonCadence).not.toHaveBeenCalled();
    expect(answers().length).toBe(1);
  });

  it('«تواصلت» from the detail marks contacted exactly once and offers back-to-list', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(callbackUpdate('tw:pcontact:2'));

    // The heart of the guard: ONE mark, ONE log, ONE answer — no double-call,
    // no recursion into the nudge contacted handler, and NO nudge-cycle claim.
    expect(h.markContacted).toHaveBeenCalledTimes(1);
    expect(h.markContacted).toHaveBeenCalledWith(1, 2, expect.any(Date));
    expect(h.logAction).toHaveBeenCalledTimes(1);
    expect(h.logAction).toHaveBeenCalledWith(1, 2, 'contacted');
    expect(h.claimNudge).not.toHaveBeenCalled();
    expect(answers().length).toBe(1);
    // The ack edit carries a back-to-list button.
    expect(lastEditData()).toEqual(['tw:list:1']);
  });

  it('«رجوع» re-renders the list at page 1', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(callbackUpdate('tw:list:1'));
    expect(lastEditData()).toEqual(['tw:person:1', 'tw:person:2', 'tw:person:3']);
    expect(answers().length).toBe(1);
  });

  it('removing from the detail calls removePerson once', async () => {
    h.listPeople.mockResolvedValue(people(3));
    await bot.handleUpdate(callbackUpdate('tw:rm:2'));
    expect(h.removePerson).toHaveBeenCalledTimes(1);
    expect(h.removePerson).toHaveBeenCalledWith(1, 2);
    expect(answers().length).toBe(1);
  });
});

describe('parsePersonInput', () => {
  it('treats a single word as a bare name', () => {
    expect(parsePersonInput('فاطمة')).toEqual({ name: 'فاطمة', relation: null });
  });
  it('treats the first word as the relation when there are two', () => {
    expect(parsePersonInput('خالتي فاطمة')).toEqual({ name: 'فاطمة', relation: 'خالتي' });
  });
  it('rejects empty / whitespace', () => {
    expect(parsePersonInput('   ')).toBeNull();
  });
});

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
    first_name: 'tawasul',
    username: 'tawasul_bot',
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

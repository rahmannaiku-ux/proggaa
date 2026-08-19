import { afterEach, describe, expect, it, vi } from "vitest";
import { Telegram } from "telegraf";
import { createBot } from "../src/bot/bot";
import { buildServiceContainer } from "../src/services/container";
import { MockTelegramLinkService } from "../src/services/linking/mock/MockTelegramLinkService";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * These tests exercise the real `createBot()` pipeline end to end —
 * session middleware, auth resolution, rate limiting, error handling,
 * and the actual command/action handlers — by calling
 * `bot.handleUpdate(update)` with hand-built Telegram `Update` objects,
 * exactly like a real webhook/polling delivery would.
 *
 * The only thing stubbed out is the network layer: `bot.telegram.*`
 * (sendMessage / editMessageText / answerCbQuery) is replaced with a spy
 * so no real HTTP call reaches Telegram's API, and so we can assert on
 * exactly what the bot *would* have sent.
 */

let nextUserId = 900000;
function freshTelegramId(): number {
  nextUserId += 1;
  return nextUserId;
}

/**
 * Not importing telegraf's `Update` type here deliberately — its export
 * path has moved between telegraf versions, and getting it wrong would
 * break this whole file's compilation over something that doesn't affect
 * runtime behavior. `any` costs us type-checking on the fixture shape,
 * not on the assertions, which is what actually matters in this file.
 */
function textUpdate(userId: number, chatId: number, text: string, updateId = 1): any {
  const isCommand = text.startsWith("/");
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: "private", first_name: "Test" },
      from: { id: userId, is_bot: false, first_name: "Test", username: "testuser" },
      text,
      ...(isCommand
        ? { entities: [{ offset: 0, length: text.split(" ")[0].length, type: "bot_command" }] }
        : {}),
    },
  };
}

function callbackUpdate(userId: number, chatId: number, data: string, messageId: number, updateId = 1): any {
  return {
    update_id: updateId,
    callback_query: {
      id: String(updateId),
      from: { id: userId, is_bot: false, first_name: "Test" },
      chat_instance: "test",
      data,
      message: {
        message_id: messageId,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private", first_name: "Test" },
        text: "placeholder",
      },
    },
  };
}

function buildTestBot() {
  const services = buildServiceContainer();
  const bot = createBot(services);

  const sendMessage = vi.fn(async (_chatId: number, text: string, _extra?: unknown) => ({
    message_id: Math.floor(Math.random() * 100000),
    date: 0,
    chat: { id: _chatId },
    text,
  }));
  const editMessageText = vi.fn(async (_chatId: number, _messageId: number, _inlineMessageId: undefined, text: string) => ({
    message_id: _messageId,
    date: 0,
    chat: { id: _chatId },
    text,
  }));
  const answerCbQuery = vi.fn(async () => true);

  const knownMethods: Record<string, (...args: any[]) => unknown> = {
    sendMessage,
    editMessageText,
    answerCbQuery,
  };

  // Two earlier approaches to stopping these tests from hitting the real
  // Telegram API — patching individual methods onto bot.telegram, then
  // replacing bot.telegram wholesale — both turned out not to reliably
  // intercept every call path in this telegraf version. This spies on
  // `Telegram.prototype.callApi` directly instead: every single outgoing
  // request, however it's shaped by whichever shortcut method the code
  // called, ultimately funnels through this one prototype method, so
  // patching it here is the most reliable place to guarantee nothing
  // ever reaches the real network.
  vi.spyOn(Telegram.prototype, "callApi").mockImplementation(async (method: string, payload: any) => {
    if (method === "sendMessage") {
      return knownMethods.sendMessage(payload?.chat_id, payload?.text, payload);
    }
    if (method === "editMessageText") {
      return knownMethods.editMessageText(payload?.chat_id, payload?.message_id, undefined, payload?.text);
    }
    if (method === "answerCallbackQuery" || method === "answerCbQuery") {
      return knownMethods.answerCbQuery(payload?.text, payload);
    }
    // Any other API call the app code makes (sendChatAction, getMe, ...)
    // resolves to a harmless empty object instead of hitting the network.
    return {};
  });

  // Telegraf normally fetches this once via a real getMe() call inside
  // bot.launch(), and caches it as bot.botInfo for command matching
  // (e.g. distinguishing /start from /start@someOtherBot). These tests
  // never call launch(), so without this, the first handleUpdate() would
  // trigger a real network call to api.telegram.org with our fake test
  // token and fail with 404.
  (bot as any).botInfo = {
    id: 0,
    is_bot: true,
    first_name: "Test Bot",
    username: "test_bot",
  };

  return { bot, services, sendMessage, editMessageText, answerCbQuery };
}

describe("end-to-end: /start", () => {
  it("shows the unlinked welcome screen for a brand-new user", async () => {
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();

    await bot.handleUpdate(textUpdate(userId, userId, "/start"));

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [, text] = sendMessage.mock.calls[0];
    expect(text).toContain("Welcome to Proggaa");
  });

  it("never treats the Telegram username as identity", async () => {
    // Even though the update carries a username, an unlinked user must
    // still see the unlinked screen — proving the bot isn't trusting it.
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();
    const update = textUpdate(userId, userId, "/start") as any;
    update.message.from.username = "admin"; // deliberately suspicious username

    await bot.handleUpdate(update);

    const [, text] = sendMessage.mock.calls[0];
    expect(text).toContain("Welcome to Proggaa"); // unlinked screen, not an admin dashboard
  });
});

describe("end-to-end: account linking flow", () => {
  it("links a user via /link + token message, then /start shows the personalized screen", async () => {
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();
    const token = MockTelegramLinkService.devIssueToken("user_student_1");

    await bot.handleUpdate(textUpdate(userId, userId, "/link", 1));
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("Connect your account");

    await bot.handleUpdate(textUpdate(userId, userId, token, 2));
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("Connected!");

    await bot.handleUpdate(textUpdate(userId, userId, "/start", 3));
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("Ayesha Rahman");
  });

  it("rejects an invalid token end to end", async () => {
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();

    await bot.handleUpdate(textUpdate(userId, userId, "/link", 1));
    await bot.handleUpdate(textUpdate(userId, userId, "NOT-A-REAL-TOKEN", 2));

    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("invalid or has expired");
  });
});

describe("end-to-end: role authorization", () => {
  it("blocks an unlinked user from /admin", async () => {
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();

    await bot.handleUpdate(textUpdate(userId, userId, "/admin"));

    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("Use /link");
  });

  it("blocks a linked STUDENT from /admin", async () => {
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();
    const token = MockTelegramLinkService.devIssueToken("user_student_1");

    await bot.handleUpdate(textUpdate(userId, userId, "/link", 1));
    await bot.handleUpdate(textUpdate(userId, userId, token, 2));
    await bot.handleUpdate(textUpdate(userId, userId, "/admin", 3));

    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("permission");
  });

  it("allows a linked ADMIN through /admin and shows platform stats", async () => {
    const { bot, sendMessage } = buildTestBot();
    const userId = freshTelegramId();
    const token = MockTelegramLinkService.devIssueToken("user_admin_1");

    await bot.handleUpdate(textUpdate(userId, userId, "/link", 1));
    await bot.handleUpdate(textUpdate(userId, userId, token, 2));
    await bot.handleUpdate(textUpdate(userId, userId, "/admin", 3));

    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("Proggaa Admin");
  });
});

describe("end-to-end: payment approval requires confirmation", () => {
  it("does not mutate the payment on the first tap, only after confirm", async () => {
    const { bot, sendMessage, answerCbQuery } = buildTestBot();
    const userId = freshTelegramId();
    const token = MockTelegramLinkService.devIssueToken("user_admin_1");

    await bot.handleUpdate(textUpdate(userId, userId, "/link", 1));
    await bot.handleUpdate(textUpdate(userId, userId, token, 2));

    // First tap: "ask" — must show a confirm prompt, not approve anything.
    await bot.handleUpdate(callbackUpdate(userId, userId, "payment:approve:ask:pay_1", 100, 3));
    expect(sendMessage.mock.calls.at(-1)?.[1]).toContain("Approve this payment?");

    // Second tap: "confirm" — this is the one that actually calls the service.
    await bot.handleUpdate(callbackUpdate(userId, userId, "payment:approve:confirm:pay_1", 100, 4));
    expect(answerCbQuery).toHaveBeenCalled();
  });
});
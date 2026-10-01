import { vi } from "vitest";
import { Telegram } from "telegraf";
import { createBot } from "../../src/bot/bot";
import { buildFakeContainer } from "../fakes";

/**
 * Drives the real createBot() pipeline (middleware, auth, rate limit, error
 * handling and the actual handlers) with hand-built Telegram updates, exactly
 * like a webhook delivery. Only the network layer is replaced: every outgoing
 * Telegram API call is captured so tests can assert on what the bot would send.
 */

let nextId = 900_000;
export function freshTelegramId(): number {
  nextId += 1;
  return nextId;
}

export function textUpdate(userId: number, chatId: number, text: string, chatType: "private" | "group" | "supergroup" = "private"): any {
  const isCommand = text.startsWith("/");
  return {
    update_id: Math.floor(Math.random() * 1e9),
    message: {
      message_id: Math.floor(Math.random() * 1e6),
      date: Math.floor(Date.now() / 1000),
      chat: { id: chatId, type: chatType, first_name: "Test", title: chatType === "private" ? undefined : "Test group" },
      from: { id: userId, is_bot: false, first_name: "Test", username: "testuser" },
      text,
      ...(isCommand ? { entities: [{ offset: 0, length: text.split(" ")[0]!.length, type: "bot_command" }] } : {}),
    },
  };
}

export function callbackUpdate(userId: number, chatId: number, data: string, chatType: "private" | "group" = "private"): any {
  return {
    update_id: Math.floor(Math.random() * 1e9),
    callback_query: {
      id: String(Math.random()),
      from: { id: userId, is_bot: false, first_name: "Test" },
      chat_instance: "test",
      data,
      message: {
        message_id: 5,
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: chatType, first_name: "Test" },
        text: "placeholder",
      },
    },
  };
}

export function buildTestBot(services = buildFakeContainer()) {
  const bot = createBot(services, "test-token-for-vitest");
  const sent: { chatId: unknown; text: string; extra: any }[] = [];
  const edits: { text: string; extra: any }[] = [];
  /** Every message sent or edited, in the order the bot did it. */
  const log: { kind: "send" | "edit"; text: string; extra: any }[] = [];
  const answers: { text?: string }[] = [];

  // Every outgoing request funnels through Telegram.prototype.callApi.
  vi.spyOn(Telegram.prototype, "callApi").mockImplementation((async (method: string, payload: any) => {
    if (method === "sendMessage") {
      sent.push({ chatId: payload?.chat_id, text: payload?.text, extra: payload });
      log.push({ kind: "send", text: payload?.text, extra: payload });
      return { message_id: sent.length, date: 0, chat: { id: payload?.chat_id }, text: payload?.text };
    }
    if (method === "editMessageText") {
      edits.push({ text: payload?.text, extra: payload });
      log.push({ kind: "edit", text: payload?.text, extra: payload });
      return { message_id: 1, date: 0, chat: { id: payload?.chat_id }, text: payload?.text };
    }
    if (method === "answerCallbackQuery") {
      answers.push({ text: payload?.text });
      return true;
    }
    return {};
  }) as any);

  // bot.launch() would normally fetch this; the tests never launch.
  (bot as any).botInfo = { id: 0, is_bot: true, first_name: "Test Bot", username: "test_bot" };

  /** Everything sent back to the person, newest last. */
  const texts = () => sent.map((m) => m.text);
  const lastText = () => sent[sent.length - 1]?.text ?? "";
  /** What the person saw last, whether it was a new message or an edit. */
  const lastShown = () => log[log.length - 1]?.text ?? "";
  return { bot, services, sent, edits, log, answers, texts, lastText, lastShown };
}

/** Links a fresh Telegram user to the given fake account through the real /link flow. */
export async function linkAs(
  harness: ReturnType<typeof buildTestBot>,
  userId: string,
  telegramId = freshTelegramId()
) {
  const code = harness.services.link.issueToken(userId);
  await harness.bot.handleUpdate(textUpdate(telegramId, telegramId, "/link"));
  await harness.bot.handleUpdate(textUpdate(telegramId, telegramId, code));
  return telegramId;
}

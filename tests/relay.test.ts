import { describe, expect, it, vi } from "vitest";
import { NotificationRelay, escapeHtml, type MessageSender } from "../src/services/notifications/NotificationRelay";
import type { FeedNotification } from "../src/types/domain";
import { FakeFeed, FakePreferences } from "./fakes";

function item(id: string, minutes: number, extra: Partial<FeedNotification> = {}): FeedNotification {
  return {
    id,
    proggaaUserId: "user_student_1",
    telegramId: "555",
    category: "RESULTS",
    title: `Title ${id}`,
    body: `Body ${id}`,
    createdAt: new Date(Date.UTC(2026, 9, 2, 10, minutes)).toISOString(),
    ...extra,
  };
}

function setup(options: { failWith?: (n: number) => unknown } = {}) {
  const feed = new FakeFeed();
  const prefs = new FakePreferences();
  const sendMessage = vi.fn(async (...args: Parameters<MessageSender["sendMessage"]>) => {
    const err = options.failWith?.(sendMessage.mock.calls.length);
    if (err) throw err;
    return args;
  });
  const sender: MessageSender = { sendMessage };
  const now = new Date(Date.UTC(2026, 9, 2, 10, 30));
  const relay = new NotificationRelay(feed, sender, prefs, { webUrl: "https://proggaa.example/", pageSize: 2, now: () => now, maxAttempts: 2 });
  return { feed, prefs, sendMessage, relay };
}

describe("NotificationRelay", () => {
  it("delivers new notifications oldest first, in Bangladesh time, with a link button", async () => {
    const { feed, relay, sendMessage } = setup();
    feed.items = [item("n2", 12, { linkPath: "/results/r1" }), item("n1", 10)];

    expect(await relay.tick()).toBe(2);

    expect(sendMessage).toHaveBeenCalledTimes(2);
    const [chatId, text, extra] = sendMessage.mock.calls[0]!;
    expect(chatId).toBe("555");
    expect(text).toContain("<b>Title n1</b>");
    expect(text).toMatch(/BST/); // 10:10 UTC is 4:10 pm in Bangladesh
    expect(extra.parse_mode).toBe("HTML");
    expect(extra.reply_markup).toBeUndefined();
    expect(sendMessage.mock.calls[1]![2].reply_markup?.inline_keyboard[0]![0]!.url).toBe("https://proggaa.example/results/r1");
  });

  it("pages through everything and does not send the same notification twice", async () => {
    const { feed, relay, sendMessage } = setup();
    feed.items = [item("n1", 1), item("n2", 2), item("n3", 3), item("n4", 4), item("n5", 5)];
    expect(await relay.tick()).toBe(5);
    expect(await relay.tick()).toBe(0);
    expect(sendMessage).toHaveBeenCalledTimes(5);
  });

  it("skips categories the hero muted but still moves past them", async () => {
    const { feed, prefs, relay, sendMessage } = setup();
    await prefs.setPreference("user_student_1", "RESULTS", false);
    feed.items = [item("n1", 1, { category: "RESULTS" }), item("n2", 2, { category: "PAYMENTS" })];

    expect(await relay.tick()).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![1]).toContain("Title n2");
  });

  it("gives up on a hero who blocked the bot and carries on", async () => {
    const { feed, relay, sendMessage } = setup({ failWith: (n) => (n === 1 ? { response: { error_code: 403 } } : undefined) });
    feed.items = [item("n1", 1), item("n2", 2)];

    expect(await relay.tick()).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("stops at a flood limit and resumes from the same notification next time", async () => {
    let failing = true;
    const { feed, relay, sendMessage } = setup({ failWith: () => (failing ? { response: { error_code: 429, parameters: { retry_after: 3 } } } : undefined) });
    feed.items = [item("n1", 1), item("n2", 2)];

    expect(await relay.tick()).toBe(0);
    failing = false;
    expect(await relay.tick()).toBe(2);
    expect(sendMessage.mock.calls.map((c) => c[1]).filter((t) => t.includes("Title n1"))).toHaveLength(2); // first try failed, second sent
  });

  it("retries an unexpected failure, then gives up after the maximum attempts", async () => {
    const { feed, relay, sendMessage } = setup({ failWith: (n) => (n <= 2 ? new Error("network") : undefined) });
    feed.items = [item("n1", 1), item("n2", 2)];

    expect(await relay.tick()).toBe(0); // attempt 1 for n1
    expect(await relay.tick()).toBe(1); // attempt 2 fails and n1 is dropped, n2 is sent
    expect(sendMessage).toHaveBeenCalledTimes(3);
  });

  it("looks back a limited time on a fresh start, not through all history", async () => {
    const { feed, relay } = setup();
    await relay.tick();
    // now is 10:30 UTC and the default look-back is 30 minutes.
    expect(feed.calls[0]!.createdAt).toBe(new Date(Date.UTC(2026, 9, 2, 10, 0)).toISOString());
  });

  it("does nothing when the website is unreachable", async () => {
    const { feed, relay } = setup();
    feed.fetchAfter = async () => {
      throw new Error("website down");
    };
    expect(await relay.tick()).toBe(0);
  });

  it("escapes HTML in titles and bodies", () => {
    expect(escapeHtml("<b>x</b> & y")).toBe("&lt;b&gt;x&lt;/b&gt; &amp; y");
  });
});

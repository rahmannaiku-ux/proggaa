import type { FeedNotification } from "../../types/domain";
import type {
  FeedCursor,
  NotificationPreferenceService,
  ProggaaNotificationFeed,
} from "../proggaa/interfaces";
import { FileStore } from "../../utils/persistence";
import { formatBstDateTime } from "../../utils/time";
import { logger } from "../../utils/logger";

/** The one Telegram call the relay needs, so tests can stand in for it. */
export interface MessageSender {
  sendMessage(
    chatId: string,
    text: string,
    extra: {
      parse_mode: "HTML";
      link_preview_options: { is_disabled: boolean };
      reply_markup?: { inline_keyboard: { text: string; url: string }[][] };
    }
  ): Promise<unknown>;
}

interface RelayState {
  cursor: FeedCursor | null;
  /** Ids already delivered, so a restart that looks back a little never repeats a message. */
  delivered: string[];
}

export interface RelayOptions {
  webUrl: string;
  pageSize?: number;
  /** How far back to look when the relay has no saved position (first start, or no disk). */
  lookbackMinutes?: number;
  /** After this many failed attempts an undeliverable item is given up on. */
  maxAttempts?: number;
  now?: () => Date;
}

const MAX_REMEMBERED = 500;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Telegram error code (and flood-wait seconds) from a failed send, if it carries one. */
function telegramFailure(error: unknown): { code?: number; retryAfter?: number } {
  const response = (error as { response?: { error_code?: number; parameters?: { retry_after?: number } } })?.response;
  return { code: response?.error_code, retryAfter: response?.parameters?.retry_after };
}

/**
 * Mirrors the website's notifications into Telegram.
 *
 * Proggaa already creates a notification for everything a hero should hear
 * about (exam reminders, results, live classes, announcements, payments,
 * achievements, streaks). Instead of asking the website to call the bot from
 * many places, the bot asks the website's feed "what is new since the last one
 * I handled?" on a timer. That keeps Proggaa as the only author of
 * notifications, and a bot that was asleep or offline simply catches up.
 *
 * Delivery rules: a muted category is skipped; a hero who blocked the bot is
 * skipped (the link stays, they just do not get messages); a flood limit pauses
 * the run; any other failure is retried on the next run a few times.
 */
export class NotificationRelay {
  private readonly store: FileStore<RelayState>;
  private readonly pageSize: number;
  private readonly lookbackMs: number;
  private readonly maxAttempts: number;
  private readonly now: () => Date;
  private readonly attempts = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly feed: ProggaaNotificationFeed,
    private readonly sender: MessageSender,
    private readonly preferences: NotificationPreferenceService,
    private readonly options: RelayOptions
  ) {
    this.store = new FileStore<RelayState>("notification-relay.json", { cursor: null, delivered: [] });
    this.pageSize = options.pageSize ?? 50;
    this.lookbackMs = (options.lookbackMinutes ?? 30) * 60_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.now = options.now ?? (() => new Date());
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass over everything new. Returns how many messages were sent. */
  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let sent = 0;
    try {
      const state = this.store.data;
      state.cursor ??= { createdAt: new Date(this.now().getTime() - this.lookbackMs).toISOString(), id: "" };

      for (;;) {
        const items = await this.feed.fetchAfter(state.cursor, this.pageSize);
        for (const item of items) {
          const outcome = await this.deliver(item);
          if (outcome === "retry") return sent; // keep the cursor here and try again next run
          if (outcome === "sent") sent += 1;
          state.cursor = { createdAt: item.createdAt, id: item.id };
          this.store.save();
        }
        if (items.length < this.pageSize) return sent;
      }
    } catch (error) {
      logger.warn("relay.tick_failed", { error: error instanceof Error ? error.message : String(error) });
      return sent;
    } finally {
      this.running = false;
    }
  }

  private async deliver(item: FeedNotification): Promise<"sent" | "skipped" | "retry"> {
    const state = this.store.data;
    if (state.delivered.includes(item.id)) return "skipped";

    const prefs = await this.preferences.getPreferences(item.proggaaUserId);
    if (prefs.categories[item.category] === false) return "skipped";

    const link = item.linkPath ? `${this.options.webUrl.replace(/\/+$/, "")}${item.linkPath}` : undefined;
    const text = [
      `<b>${escapeHtml(item.title)}</b>`,
      escapeHtml(item.body),
      `<i>${escapeHtml(formatBstDateTime(item.createdAt))}</i>`,
    ].join("\n\n");

    try {
      await this.sender.sendMessage(item.telegramId, text, {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        ...(link ? { reply_markup: { inline_keyboard: [[{ text: "Open on Proggaa", url: link }]] } } : {}),
      });
    } catch (error) {
      const { code, retryAfter } = telegramFailure(error);
      // 403: the hero blocked the bot. 400: the chat no longer exists. Neither will ever succeed.
      if (code === 403 || code === 400) {
        logger.info("relay.undeliverable", { notificationId: item.id, code });
        return "skipped";
      }
      if (code === 429) {
        logger.warn("relay.flood_wait", { retryAfter });
        return "retry";
      }
      const tries = (this.attempts.get(item.id) ?? 0) + 1;
      this.attempts.set(item.id, tries);
      if (tries >= this.maxAttempts) {
        logger.warn("relay.gave_up", { notificationId: item.id, tries });
        this.attempts.delete(item.id);
        return "skipped";
      }
      return "retry";
    }

    state.delivered.push(item.id);
    if (state.delivered.length > MAX_REMEMBERED) state.delivered.splice(0, state.delivered.length - MAX_REMEMBERED);
    this.attempts.delete(item.id);
    return "sent";
  }
}

import type { Telegram } from "telegraf";
import type { NotificationEvent } from "../../types/domain";
import type {
  NotificationPreferenceService,
  ProggaaNotificationService,
  TelegramLinkService,
} from "../proggaa/interfaces";
import { logger } from "../../utils/logger";

/**
 * Decorates a ProggaaNotificationService so that `dispatch()` still does
 * everything it did before (store the event for /notifications) AND, when
 * the recipient is linked and hasn't muted that category, actually pushes
 * a Telegram message immediately.
 *
 * This is a decorator rather than a rewrite of the mock service so that
 * swapping to a real ApiNotificationService later (e.g. one backed by a
 * webhook/queue from Proggaa) gets live push for free — just wrap it the
 * same way in container.ts.
 */
export class PushingNotificationService implements ProggaaNotificationService {
  constructor(
    private readonly inner: ProggaaNotificationService,
    private readonly telegram: Telegram,
    private readonly linkService: TelegramLinkService,
    private readonly preferenceService: NotificationPreferenceService
  ) {}

  async getRecentNotifications(proggaaUserId: string, limit?: number) {
    return this.inner.getRecentNotifications(proggaaUserId, limit);
  }

  async dispatch(event: NotificationEvent): Promise<void> {
    await this.inner.dispatch(event);
    await this.push(event);
  }

  private async push(event: NotificationEvent): Promise<void> {
    try {
      const prefs = await this.preferenceService.getPreferences(event.userId);
      if (prefs.categories[event.category] === false) {
        return; // student muted this category — respect it, no push
      }

      const telegramId = await this.linkService.getTelegramIdForProggaaUser(event.userId);
      if (!telegramId) {
        return; // not linked to a Telegram account (yet) — nothing to push to
      }

      await this.telegram.sendMessage(telegramId, `${event.title}\n\n${event.body}`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      // Common causes: the student blocked the bot, or hasn't started a
      // chat with it yet. Either way this must never throw back into
      // whatever business flow triggered the notification (a ticket
      // reply, a payment approval, ...) — it already succeeded; the push
      // is best-effort on top.
      logger.warn("notification.push_failed", {
        userId: event.userId,
        type: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

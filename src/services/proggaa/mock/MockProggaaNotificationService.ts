import type {
  NotificationCategory,
  NotificationEvent,
  NotificationPreferences,
} from "../../../types/domain";
import type {
  NotificationPreferenceService,
  ProggaaNotificationService,
} from "../interfaces";
import { FileStore } from "../../../utils/persistence";
import { logger } from "../../../utils/logger";

const DEFAULT_CATEGORIES: Record<NotificationCategory, boolean> = {
  EXAM_REMINDERS: true,
  RESULTS: true,
  COURSE_UPDATES: true,
  ASSIGNMENTS: true,
  ACHIEVEMENTS: true,
  PAYMENTS: true,
  SUPPORT_UPDATES: true,
  TEACHER_ALERTS: true,
  SYSTEM_ALERTS: true,
};

const MAX_STORED_EVENTS = 2000;

interface NotificationStoreShape {
  events: NotificationEvent[];
  preferencesByUser: Record<string, NotificationPreferences>;
}

const store = new FileStore<NotificationStoreShape>("notifications.json", {
  events: [],
  preferencesByUser: {},
});

export class MockProggaaNotificationService implements ProggaaNotificationService {
  async getRecentNotifications(proggaaUserId: string, limit = 10): Promise<NotificationEvent[]> {
    return store.data.events
      .filter((e) => e.userId === proggaaUserId)
      .slice(-limit)
      .reverse();
  }

  async dispatch(event: NotificationEvent): Promise<void> {
    store.data.events.push(event);
    if (store.data.events.length > MAX_STORED_EVENTS) {
      store.data.events.splice(0, store.data.events.length - MAX_STORED_EVENTS);
    }
    store.save();
    logger.info("notification.dispatch", { type: event.type, userId: event.userId });
    // Storage only — PushingNotificationService (see
    // services/notifications/PushingNotificationService.ts) is what
    // decorates this to also push a live Telegram message.
  }
}

export class MockNotificationPreferenceService implements NotificationPreferenceService {
  async getPreferences(proggaaUserId: string): Promise<NotificationPreferences> {
    const existing = store.data.preferencesByUser[proggaaUserId];
    if (existing) return existing;
    const created: NotificationPreferences = {
      userId: proggaaUserId,
      categories: { ...DEFAULT_CATEGORIES },
    };
    store.data.preferencesByUser[proggaaUserId] = created;
    store.save();
    return created;
  }

  async setPreference(
    proggaaUserId: string,
    category: NotificationCategory,
    enabled: boolean
  ): Promise<NotificationPreferences> {
    const prefs = await this.getPreferences(proggaaUserId);
    prefs.categories[category] = enabled;
    store.data.preferencesByUser[proggaaUserId] = prefs;
    store.save();
    return prefs;
  }
}

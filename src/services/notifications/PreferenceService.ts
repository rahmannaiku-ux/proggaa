import type { NotificationCategory, NotificationPreferences } from "../../types/domain";
import type { NotificationPreferenceService } from "../proggaa/interfaces";
import { FileStore } from "../../utils/persistence";

export const ALL_CATEGORIES: NotificationCategory[] = [
  "EXAM_REMINDERS",
  "RESULTS",
  "LIVE_CLASSES",
  "ANNOUNCEMENTS",
  "MISSIONS",
  "CHALLENGES",
  "ACHIEVEMENTS",
  "STREAK",
  "PAYMENTS",
  "SYSTEM",
];

function defaults(): Record<NotificationCategory, boolean> {
  return Object.fromEntries(ALL_CATEGORIES.map((c) => [c, true])) as Record<NotificationCategory, boolean>;
}

interface Shape {
  preferencesByUser: Record<string, NotificationPreferences>;
}

/**
 * Which kinds of notification a person switched off in Telegram.
 *
 * This is a setting of the bot's own channel, not Proggaa data (the website has
 * no per-channel preferences), so the bot stores it. It is a small JSON file in
 * PERSISTENCE_DIR when that is set, otherwise memory only. Nothing else about a
 * person is kept here, and losing the file only turns every category back on.
 */
export class FilePreferenceService implements NotificationPreferenceService {
  private readonly store = new FileStore<Shape>("notification-preferences.json", { preferencesByUser: {} });

  async getPreferences(proggaaUserId: string): Promise<NotificationPreferences> {
    const existing = this.store.data.preferencesByUser[proggaaUserId];
    // Fill in any category added since the file was written.
    if (existing) return { userId: proggaaUserId, categories: { ...defaults(), ...existing.categories } };
    return { userId: proggaaUserId, categories: defaults() };
  }

  async setPreference(
    proggaaUserId: string,
    category: NotificationCategory,
    enabled: boolean
  ): Promise<NotificationPreferences> {
    const prefs = await this.getPreferences(proggaaUserId);
    prefs.categories[category] = enabled;
    this.store.data.preferencesByUser[proggaaUserId] = prefs;
    this.store.save();
    return prefs;
  }
}

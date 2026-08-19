import { env } from "../../config/env";
import type { GroupSettings, ModerationAction, ModerationEvent } from "../../types/domain";
import { FileStore } from "../../utils/persistence";
import { logger } from "../../utils/logger";

// Built-in patterns for obvious spam/scam links & advertising. Admins can
// extend this per-group via `bannedKeywords` in GroupSettings — this list
// is intentionally conservative so moderation doesn't overreach.
const SUSPICIOUS_LINK_PATTERN = /(t\.me\/joinchat|bit\.ly|tinyurl\.com|free.*(crypto|bitcoin|forex)|earn.*money.*fast)/i;
const FLOOD_WINDOW_MS = 10_000;
const FLOOD_MAX_MESSAGES = 6;
export const MUTE_DURATION_SECONDS = 10 * 60;

interface RecentMessage {
  telegramId: string;
  timestamps: number[];
}

interface GroupStoreShape {
  settings: Record<string, GroupSettings>;
  /** violation count per `${chatId}:${telegramId}` */
  violationCounts: Record<string, number>;
  escalations: ModerationEvent[];
  escalationIdCounter: number;
}

const store = new FileStore<GroupStoreShape>("group-config.json", {
  settings: {},
  violationCounts: {},
  escalations: [],
  escalationIdCounter: 0,
});

/**
 * Bot-side (not Proggaa-backed) config + moderation state for the group
 * chats the bot is configured to act as an assistant in. Configured groups
 * come from PROGGAA_GROUP_IDS. Settings, violation counts, and escalation
 * history are JSON-file-persisted when PERSISTENCE_DIR is set (see
 * utils/persistence.ts); flood tracking stays purely in-memory since
 * losing a few seconds of message timestamps on restart is harmless.
 */
export interface GroupService {
  isConfiguredGroup(chatId: string): boolean;
  getSettings(chatId: string): GroupSettings;
  updateSettings(chatId: string, partial: Partial<Omit<GroupSettings, "chatId">>): GroupSettings;
  listConfiguredGroups(): string[];

  /** Tracks a message for flood detection. Returns true if this message trips the flood threshold. */
  recordMessageAndCheckFlood(chatId: string, telegramId: string): boolean;

  /** Checks free text against built-in + per-group spam/scam patterns. */
  matchesSpamPattern(chatId: string, text: string): string | null;

  /** Records a violation and returns the escalation action to take (never a ban). */
  recordViolation(chatId: string, telegramId: string, reason: string): ModerationAction;

  getRecentEscalations(chatId?: string): ModerationEvent[];
}

export class InMemoryGroupService implements GroupService {
  private readonly configuredGroups: Set<string>;
  private readonly recentMessages = new Map<string, RecentMessage>();

  constructor(groupIdsCsv: string | undefined = env.PROGGAA_GROUP_IDS) {
    this.configuredGroups = new Set(
      (groupIdsCsv ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    );
  }

  isConfiguredGroup(chatId: string): boolean {
    return this.configuredGroups.has(chatId);
  }

  listConfiguredGroups(): string[] {
    return [...this.configuredGroups];
  }

  getSettings(chatId: string): GroupSettings {
    const existing = store.data.settings[chatId];
    if (existing) return existing;
    const defaults: GroupSettings = {
      chatId,
      welcomeEnabled: true,
      faqEnabled: true,
      moderationEnabled: true,
      bannedKeywords: [],
    };
    store.data.settings[chatId] = defaults;
    store.save();
    return defaults;
  }

  updateSettings(chatId: string, partial: Partial<Omit<GroupSettings, "chatId">>): GroupSettings {
    const current = this.getSettings(chatId);
    const updated = { ...current, ...partial };
    store.data.settings[chatId] = updated;
    store.save();
    return updated;
  }

  recordMessageAndCheckFlood(chatId: string, telegramId: string): boolean {
    const key = `${chatId}:${telegramId}`;
    const now = Date.now();
    const entry = this.recentMessages.get(key) ?? { telegramId, timestamps: [] };
    entry.timestamps = entry.timestamps.filter((t) => now - t < FLOOD_WINDOW_MS);
    entry.timestamps.push(now);
    this.recentMessages.set(key, entry);
    return entry.timestamps.length > FLOOD_MAX_MESSAGES;
  }

  matchesSpamPattern(chatId: string, text: string): string | null {
    if (SUSPICIOUS_LINK_PATTERN.test(text)) return "suspicious link or advertising pattern";
    const { bannedKeywords } = this.getSettings(chatId);
    const lower = text.toLowerCase();
    const hit = bannedKeywords.find((kw) => lower.includes(kw.toLowerCase()));
    return hit ? `banned keyword "${hit}"` : null;
  }

  recordViolation(chatId: string, telegramId: string, reason: string): ModerationAction {
    const key = `${chatId}:${telegramId}`;
    const count = (store.data.violationCounts[key] ?? 0) + 1;
    store.data.violationCounts[key] = count;

    // 1st violation -> warning. Repeated -> temporary restriction.
    // Serious/persistent (5+) -> admin escalation on top of the mute.
    // Never an automatic ban — that always stays a human decision.
    let action: ModerationAction;
    if (count === 1) {
      action = "WARNING";
    } else if (count < 5) {
      action = "TEMP_MUTE";
    } else {
      action = "ADMIN_ALERT";
    }

    store.data.escalationIdCounter += 1;
    const event: ModerationEvent = {
      id: `mod_${store.data.escalationIdCounter}`,
      chatId,
      telegramId,
      reason,
      action,
      createdAt: new Date().toISOString(),
    };
    store.data.escalations.push(event);
    store.save();
    logger.audit("group.moderation_action", { ...event, violationCount: count });

    return action;
  }

  getRecentEscalations(chatId?: string): ModerationEvent[] {
    return store.data.escalations
      .filter((e) => !chatId || e.chatId === chatId)
      .slice(-50)
      .reverse();
  }
}

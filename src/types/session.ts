import type { Context } from "telegraf";
import type { ProggaaRole } from "./domain";

/**
 * Per-chat session state. Kept intentionally small: this is transient
 * conversational state (for example "waiting for a link code"), NOT the source
 * of truth for identity or role. Those always come from the website, through
 * the Telegram link, on every request.
 */
export interface BotSession {
  /** Set while the bot is waiting for the next message to be a link code. */
  awaitingLinkToken?: boolean;
  /** Multi-step flow state (an admin writing a reject reason, a group announcement). */
  wizard?: {
    name: string;
    step: string;
    data: Record<string, string>;
    startedAt: number; // epoch ms, used to expire stale flows
  };
  /** Epoch ms of the last update, so idle sessions can be dropped. */
  lastSeenAt?: number;
}

/**
 * The authenticated identity attached to every update by the auth middleware.
 * A Telegram username or display name is never identity or role: this object
 * is only filled in after the numeric Telegram id was resolved through the
 * website's Telegram link.
 */
export interface AuthContext {
  telegramId: string;
  linked: boolean;
  proggaaUserId?: string;
  role?: ProggaaRole;
}

export type ChatMode = "private" | "configured_group" | "unconfigured_group" | "other";

export interface ProggaaBotContext extends Context {
  session: BotSession;
  auth: AuthContext;
  /** Set by chatScopeMiddleware on every update: personal mode or Group Assistant mode. */
  chatMode: ChatMode;
}

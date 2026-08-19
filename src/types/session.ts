import type { Context } from "telegraf";
import type { ProggaaRole } from "./domain";

/**
 * Per-chat session state. Kept intentionally small — this is transient
 * conversational state (e.g. "waiting for a linking token"), NOT the
 * source of truth for identity or role. That always comes from
 * `ProggaaLinkService` / `ProggaaUserService` on each request.
 */
export interface BotSession {
  /** Set while the bot is waiting for the next free-text message to be a linking token. */
  awaitingLinkToken?: boolean;
  /** Multi-step wizard state, e.g. for AI generation or support tickets. */
  wizard?: {
    name: string;
    step: string;
    data: Record<string, string>;
    startedAt: number; // epoch ms, used to expire stale wizards
  };
}

/**
 * Authenticated identity attached to a request by the auth middleware.
 * Never trust a Telegram username/first name as identity or role —
 * this object is only populated after resolving the Telegram id through
 * `TelegramLinkService` + `ProggaaUserService`.
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
  /** Set by chatScopeMiddleware on every update — decides Student vs Group Assistant mode. */
  chatMode: ChatMode;
}

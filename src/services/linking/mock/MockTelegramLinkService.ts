import type { ProggaaRole } from "../../../types/domain";
import type { LinkTokenResult, TelegramLinkService } from "../../proggaa/interfaces";
import {
  AccountMismatchError,
  AlreadyLinkedError,
  InvalidOrExpiredTokenError,
} from "../../proggaa/errors";
import { FileStore } from "../../../utils/persistence";
import { logger } from "../../../utils/logger";
import { mockUsers } from "../../proggaa/mock/mockData";

interface PendingToken {
  token: string;
  proggaaUserId: string;
  role: ProggaaRole;
  expiresAt: number; // epoch ms
  /** If set, this token may only be redeemed by this Telegram id (relink flow). */
  restrictedToTelegramId?: string;
}

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes, mirrors a typical one-time-token window

interface LinkStoreShape {
  linkedAccounts: Record<string, LinkTokenResult>; // telegramId -> account
}

// Losing a link forces the student to re-link from scratch, so this is
// persisted (see utils/persistence.ts) even though pendingTokens (below,
// 10-minute TTL, low cost to lose) stays in-memory only.
const linkStore = new FileStore<LinkStoreShape>("telegram-links.json", { linkedAccounts: {} });

/**
 * Mock account-linking backend.
 *
 * In production, the Proggaa website generates the one-time token when
 * the user clicks "Connect Telegram" in their account settings, and this
 * service becomes a thin client calling the real Proggaa API to verify
 * it. Until then, this in-memory implementation lets the whole linking
 * flow (including expiration and mismatch handling) be tested end-to-end.
 *
 * For local testing, call `MockTelegramLinkService.devIssueToken(...)`
 * (e.g. from a test or a temporary admin command) to mint a token the
 * way the website eventually will.
 */
export class MockTelegramLinkService implements TelegramLinkService {
  private static pendingTokens = new Map<string, PendingToken>();

  /** Test/dev helper: mints a one-time token for a given demo Proggaa user. */
  static devIssueToken(proggaaUserId: string, restrictedToTelegramId?: string): string {
    const user = mockUsers.find((u) => u.id === proggaaUserId);
    if (!user) throw new InvalidOrExpiredTokenError("Unknown demo user id.");
    const token = `DEV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    MockTelegramLinkService.pendingTokens.set(token, {
      token,
      proggaaUserId: user.id,
      role: user.role,
      expiresAt: Date.now() + TOKEN_TTL_MS,
      restrictedToTelegramId,
    });
    return token;
  }

  async getLinkedAccount(telegramId: string): Promise<LinkTokenResult | null> {
    return linkStore.data.linkedAccounts[telegramId] ?? null;
  }

  async linkWithToken(telegramId: string, token: string): Promise<LinkTokenResult> {
    const normalizedToken = token.trim().toUpperCase();

    const existingLink = linkStore.data.linkedAccounts[telegramId];
    if (existingLink) {
      throw new AlreadyLinkedError();
    }

    const pending = MockTelegramLinkService.pendingTokens.get(normalizedToken);
    if (!pending) {
      logger.audit("link.failed_invalid_token", { telegramId });
      throw new InvalidOrExpiredTokenError();
    }

    if (pending.expiresAt < Date.now()) {
      MockTelegramLinkService.pendingTokens.delete(normalizedToken);
      logger.audit("link.failed_expired_token", { telegramId });
      throw new InvalidOrExpiredTokenError();
    }

    if (pending.restrictedToTelegramId && pending.restrictedToTelegramId !== telegramId) {
      logger.audit("link.failed_account_mismatch", { telegramId });
      throw new AccountMismatchError();
    }

    // Token is single-use: consume it immediately so it can't be replayed.
    MockTelegramLinkService.pendingTokens.delete(normalizedToken);

    const result: LinkTokenResult = { proggaaUserId: pending.proggaaUserId, role: pending.role };
    linkStore.data.linkedAccounts[telegramId] = result;
    linkStore.save();
    logger.audit("link.success", { telegramId, proggaaUserId: pending.proggaaUserId });
    return result;
  }

  async unlink(telegramId: string): Promise<void> {
    delete linkStore.data.linkedAccounts[telegramId];
    linkStore.save();
    logger.audit("link.unlinked", { telegramId });
  }

  async getTelegramIdForProggaaUser(proggaaUserId: string): Promise<string | null> {
    // Linear scan — fine at mock/demo scale. A real implementation should
    // index this the other way (telegramId is already the primary key on
    // the real link table; add a secondary index on proggaaUserId).
    for (const [telegramId, account] of Object.entries(linkStore.data.linkedAccounts)) {
      if (account.proggaaUserId === proggaaUserId) return telegramId;
    }
    return null;
  }
}

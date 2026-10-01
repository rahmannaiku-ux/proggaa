import type { ProggaaRole } from "../../../types/domain";
import type { LinkTokenResult, TelegramLinkService } from "../interfaces";
import { AlreadyLinkedError, InvalidOrExpiredTokenError } from "../errors";
import { ApiClient, apiErrorOf } from "./ApiClient";
import { mapRole } from "./mappers";

interface WebLink {
  proggaaUserId: string;
  role: string;
}

function toResult(link: WebLink): LinkTokenResult {
  return { proggaaUserId: link.proggaaUserId, role: mapRole(link.role) as ProggaaRole };
}

/**
 * Account linking against the website. The student creates a one-time code
 * under Settings > Telegram on the website and sends it to the bot; the bot
 * redeems it here. The bot never sees or asks for a password.
 */
export class ApiTelegramLinkService implements TelegramLinkService {
  constructor(private readonly api: ApiClient) {}

  async getLinkedAccount(telegramId: string): Promise<LinkTokenResult | null> {
    const link = await this.api.get<WebLink | null>("/api/telegram/link", { telegramId });
    return link ? toResult(link) : null;
  }

  async linkWithToken(telegramId: string, token: string): Promise<LinkTokenResult> {
    try {
      const link = await this.api.post<WebLink>("/api/telegram/link", { token: token.trim(), telegramId });
      return toResult(link);
    } catch (error) {
      const { apiCode } = apiErrorOf(error);
      if (apiCode === "INVALID_TOKEN" || apiCode === "EXPIRED_TOKEN" || apiCode === "USED_TOKEN") {
        throw new InvalidOrExpiredTokenError();
      }
      if (apiCode === "TELEGRAM_ALREADY_LINKED" || apiCode === "USER_ALREADY_LINKED") {
        throw new AlreadyLinkedError();
      }
      throw error;
    }
  }

  async unlink(telegramId: string): Promise<void> {
    await this.api.delete("/api/telegram/link", { telegramId });
  }

  async getTelegramIdForProggaaUser(proggaaUserId: string): Promise<string | null> {
    const link = await this.api.get<{ telegramId: string } | null>("/api/telegram/link", { proggaaUserId });
    return link?.telegramId ?? null;
  }
}

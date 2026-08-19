import type { MiddlewareFn } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { logger } from "../../utils/logger";

/**
 * Resolves `ctx.auth` on every update.
 *
 * This is the ONLY place that decides who the user is. It never trusts
 * `ctx.from.username` / `first_name` — those are Telegram profile fields
 * the user fully controls and must never be treated as identity or role.
 * Instead it looks up the numeric Telegram id against `TelegramLinkService`,
 * then asks `ProggaaUserService` for the current role every time (so a
 * role change on the website takes effect immediately, with no caching
 * bugs where a demoted admin keeps admin access in Telegram).
 */
export function createAuthMiddleware(services: ServiceContainer): MiddlewareFn<ProggaaBotContext> {
  return async (ctx, next) => {
    const telegramId = ctx.from?.id?.toString();

    if (!telegramId) {
      ctx.auth = { telegramId: "unknown", linked: false };
      return next();
    }

    try {
      const linked = await services.linkService.getLinkedAccount(telegramId);
      if (!linked) {
        ctx.auth = { telegramId, linked: false };
        return next();
      }

      // Re-fetch role from the source of truth on every request rather than
      // trusting whatever role was returned at link time.
      const currentRole = await services.userService.getRole(linked.proggaaUserId);

      ctx.auth = {
        telegramId,
        linked: true,
        proggaaUserId: linked.proggaaUserId,
        role: currentRole ?? linked.role,
      };
    } catch (error) {
      logger.error("auth.resolve_failed", { telegramId, error: String(error) });
      ctx.auth = { telegramId, linked: false };
    }

    return next();
  };
}

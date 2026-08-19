import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import { env } from "../../config/env";
import { MockTelegramLinkService } from "../../services/linking/mock/MockTelegramLinkService";
import { mockUsers } from "../../services/proggaa/mock/mockData";

/**
 * DEV-ONLY. Simulates the "Generate a one-time code" button that will
 * eventually live on the Proggaa website, so /link can be tested without
 * a real website. Disabled outside NODE_ENV=development.
 */
export function registerDevTokenCommand(bot: Telegraf<ProggaaBotContext>) {
  if (env.NODE_ENV !== "development") return;

  bot.command("devtoken", async (ctx) => {
    const lines = mockUsers.map((user) => {
      const token = MockTelegramLinkService.devIssueToken(user.id);
      return `${user.role.padEnd(7)} → \`${token}\`  (${user.name})`;
    });
    await ctx.reply(
      "🧪 *Dev-only: mock linking tokens*\n\n" +
        lines.join("\n") +
        "\n\nSend one of these to the bot (or use /link then paste it) to simulate connecting that account. " +
        "Each token expires in 10 minutes and can be used once.",
      { parse_mode: "Markdown" }
    );
  });
}

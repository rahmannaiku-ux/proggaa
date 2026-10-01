import http from "node:http";
import { createHash } from "node:crypto";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { startKeepAlive } from "./utils/keepAlive";
import { buildServiceContainer } from "./services/container";
import { NotificationRelay } from "./services/notifications/NotificationRelay";
import { createBot } from "./bot/bot";

type Bot = ReturnType<typeof createBot>;

/** Telegram sends this value back in a header on every webhook request, so nobody else can post updates. */
function webhookSecretToken(): string {
  return createHash("sha256").update(`${env.BOT_TOKEN}:${env.WEBHOOK_SECRET_PATH}`).digest("hex");
}

async function startPolling(bot: Bot) {
  // bot.launch() does not resolve until the bot stops (documented Telegraf
  // behaviour for long polling), so it is not awaited before logging startup.
  bot.launch().catch((error) => {
    logger.error("bot.launch_failed", { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  });
  logger.info("bot.started", { env: env.NODE_ENV, mode: "polling" });
}

async function startWebhook(bot: Bot) {
  const baseUrl = (env.WEBHOOK_URL ?? env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
  const webhookPath = `/telegraf/${env.WEBHOOK_SECRET_PATH}`;

  const telegrafHandler = await bot.createWebhook({
    domain: baseUrl,
    path: webhookPath,
    secret_token: webhookSecretToken(),
    allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
  });

  const server = http.createServer((req, res) => {
    // An external uptime pinger (or our own keep-alive) hits this to keep a free host awake.
    if (req.url === "/" || req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    telegrafHandler(req, res);
  });

  server.listen(env.PORT, () => {
    logger.info("bot.started", { env: env.NODE_ENV, mode: "webhook", port: env.PORT });
    if (env.KEEP_ALIVE === "on") startKeepAlive(`${baseUrl}/healthz`);
  });

  return server;
}

async function main() {
  const services = buildServiceContainer();
  const bot = createBot(services);

  // Mirror the website's notifications into Telegram.
  const relay = new NotificationRelay(
    services.notificationFeed,
    { sendMessage: (chatId, text, extra) => bot.telegram.sendMessage(chatId, text, extra) },
    services.preferenceService,
    { webUrl: env.PROGGAA_WEB_URL, lookbackMinutes: env.RELAY_LOOKBACK_MINUTES }
  );

  let server: http.Server | undefined;
  if (env.BOT_MODE === "webhook") server = await startWebhook(bot);
  else await startPolling(bot);

  relay.start(env.RELAY_INTERVAL_SECONDS * 1000);
  logger.info("relay.started", { everySeconds: env.RELAY_INTERVAL_SECONDS });

  const shutdown = (signal: string) => {
    logger.info("bot.stopping", { signal });
    relay.stop();
    bot.stop(signal);
    if (server) server.close(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("bot.fatal_startup_error", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

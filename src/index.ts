import http from "node:http";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { buildServiceContainer } from "./services/container";
import { createBot } from "./bot/bot";

async function startPolling(bot: ReturnType<typeof createBot>) {
  // NOTE: bot.launch() does not resolve until the bot stops (this is
  // documented Telegraf behavior for long polling, see
  // https://github.com/telegraf/telegraf/issues/1749). So we must not
  // await it before logging startup, or the log lines below would never
  // run even though the bot is actually up and polling fine.
  bot.launch().catch((error) => {
    logger.error("bot.launch_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });

  logger.info("bot.started", { env: env.NODE_ENV, mode: "polling" });
  // eslint-disable-next-line no-console
  console.log(`🎓 Proggaa bot is running (${env.NODE_ENV}, polling). Press Ctrl+C to stop.`);

  process.once("SIGINT", () => {
    logger.info("bot.stopping", { signal: "SIGINT" });
    bot.stop("SIGINT");
  });
  process.once("SIGTERM", () => {
    logger.info("bot.stopping", { signal: "SIGTERM" });
    bot.stop("SIGTERM");
  });
}

async function startWebhook(bot: ReturnType<typeof createBot>) {
  const baseUrl = (env.WEBHOOK_URL ?? env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
  const webhookPath = `/telegraf/${env.WEBHOOK_SECRET_PATH}`;
  const webhookUrl = `${baseUrl}${webhookPath}`;

  const telegrafHandler = await bot.createWebhook({ domain: baseUrl, path: webhookPath });

  const server = http.createServer((req, res) => {
    // Free hosts like Render spin a service down after ~15 minutes with
    // no HTTP traffic. An external uptime pinger (e.g. UptimeRobot) hits
    // this route every few minutes to keep the bot warm — it doesn't
    // need to do anything but answer 200.
    if (req.url === "/" || req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    telegrafHandler(req, res);
  });

  server.listen(env.PORT, () => {
    logger.info("bot.started", { env: env.NODE_ENV, mode: "webhook", webhookUrl, port: env.PORT });
    // eslint-disable-next-line no-console
    console.log(`🎓 Proggaa bot is running (${env.NODE_ENV}, webhook) on port ${env.PORT}.`);
  });

  const shutdown = (signal: string) => {
    logger.info("bot.stopping", { signal });
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

async function main() {
  const services = buildServiceContainer();
  const bot = createBot(services);

  if (env.BOT_MODE === "webhook") {
    await startWebhook(bot);
  } else {
    await startPolling(bot);
  }
}

main().catch((error) => {
  logger.error("bot.fatal_startup_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

import http from "node:http";

import { env } from "./config/env";
import { logger } from "./utils/logger";
import { buildServiceContainer } from "./services/container";
import { createBot } from "./bot/bot";
import { startKeepAlive } from "./utils/keepAlive";
import { ProggaaEventReceiver } from "./services/events/ProggaaEventReceiver";
import { createEventsHandler, EVENTS_PATH } from "./services/events/httpHandler";

type EventsHandler = ReturnType<typeof createEventsHandler>;

/** Polling mode has no HTTP server of its own, so start a tiny one just for website events. */
function startEventsServer(eventsHandler: EventsHandler) {
  const server = http.createServer((req, res) => {
    if (req.url?.split("?")[0] === EVENTS_PATH) {
      eventsHandler(req, res);
      return;
    }
    res.writeHead(req.url === "/healthz" ? 200 : 404, { "Content-Type": "text/plain" });
    res.end(req.url === "/healthz" ? "ok" : "not found");
  });
  server.listen(env.PORT, () => logger.info("events.listening", { port: env.PORT, path: EVENTS_PATH }));
  return server;
}

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

async function startWebhook(bot: ReturnType<typeof createBot>, eventsHandler: EventsHandler) {
  const baseUrl = (env.WEBHOOK_URL ?? env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");
  const webhookPath = `/telegraf/${env.WEBHOOK_SECRET_PATH}`;
  const webhookUrl = `${baseUrl}${webhookPath}`;

  const telegrafHandler = await bot.createWebhook({ domain: baseUrl, path: webhookPath });

  const server = http.createServer((req, res) => {
    // Free hosts like Render spin a service down after ~15 minutes with
    // no HTTP traffic. An external uptime pinger (e.g. UptimeRobot) hits
    // this route every few minutes to keep the bot warm — it doesn't
    // need to do anything but answer 200.
    if (req.url?.split("?")[0] === EVENTS_PATH) {
      eventsHandler(req, res);
      return;
    }
    if (req.url === "/" || req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    telegrafHandler(req, res);
  });

  server.listen(env.PORT, () => {
    logger.info("bot.started", { env: env.NODE_ENV, mode: "webhook", webhookUrl, port: env.PORT });
    if (env.KEEP_ALIVE === "on") {
      startKeepAlive(`${baseUrl}/healthz`);
      logger.info("keepalive.started", { url: `${baseUrl}/healthz` });
    }
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
  const receiver = new ProggaaEventReceiver(services.notificationService, env.PROGGAA_BOT_WEBHOOK_SECRET);
  const eventsHandler = createEventsHandler(receiver);

  if (env.BOT_MODE === "webhook") {
    await startWebhook(bot, eventsHandler);
  } else {
    if (env.PROGGAA_BOT_WEBHOOK_SECRET) startEventsServer(eventsHandler);
    await startPolling(bot);
  }
}

main().catch((error) => {
  logger.error("bot.fatal_startup_error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});

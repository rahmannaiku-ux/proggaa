import "dotenv/config";
import { z } from "zod";

// A .env file with a deliberately blank line (e.g. `WEBHOOK_URL=`, as
// .env.example has for settings you only need in webhook mode) makes dotenv set
// that variable to an empty string rather than leave it unset. Zod's
// `.optional()` only treats `undefined` as "not provided", so blank values are
// turned into undefined first.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalString = () => z.preprocess(blankToUndefined, z.string().optional());
const optionalUrl = () => z.preprocess(blankToUndefined, z.string().url().optional());

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),

  // --- Proggaa (the website) ---
  // The public address of the website, e.g. https://progga-zeta.vercel.app.
  // Used for every link the bot sends.
  PROGGAA_WEB_URL: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:3000")),
  // Where the bot calls /api/bot/*. Defaults to PROGGAA_WEB_URL, which is right
  // because the API is part of the same website.
  PROGGAA_API_URL: optionalUrl(),
  // Shared secret the website checks on every /api/bot/* call (the website's own PROGGAA_API_KEY).
  PROGGAA_API_KEY: optionalString(),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Comma-separated Telegram chat ids (negative numbers for groups, e.g.
  // "-1001234567890") where Group Assistant mode (welcome, FAQ, moderation) is
  // active. Any other group the bot is added to is ignored.
  PROGGAA_GROUP_IDS: optionalString(),

  // Directory for the bot's own small JSON files (notification mutes, the
  // notification relay position, group settings). On Render this is a mounted
  // Disk. Unset means memory only, which resets on every restart.
  PERSISTENCE_DIR: optionalString(),

  // --- Notifications ---
  // How often the bot asks the website for new notifications, in seconds.
  RELAY_INTERVAL_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  // With no saved position (first start, or no disk) look this far back, so a
  // restart does not drop what happened just before it. Already-sent ones are not repeated.
  RELAY_LOOKBACK_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),

  // --- Connection mode ---
  // "polling": the bot pulls updates from Telegram (simplest for local use).
  // "webhook": Telegram pushes updates to an HTTP endpoint (needed on hosts that
  // only run web services, such as Render's free tier).
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),
  // Public base URL Telegram should post to. Render provides RENDER_EXTERNAL_URL itself.
  WEBHOOK_URL: optionalUrl(),
  RENDER_EXTERNAL_URL: optionalUrl(),
  // Random path segment for the webhook route. Required when BOT_MODE=webhook.
  // Telegram requests are additionally checked with a secret header derived from it.
  WEBHOOK_SECRET_PATH: z.preprocess(blankToUndefined, z.string().min(16).optional()),
  // Webhook mode: ping our own public URL every 10 minutes so a free Render
  // instance does not sleep. Set to "off" on a paid or always-on host.
  KEEP_ALIVE: z.preprocess(blankToUndefined, z.enum(["on", "off"]).default("on")),
  PORT: z.coerce.number().default(3000),
});

const envSchemaWithRefinements = envSchema
  .refine((data) => data.BOT_MODE !== "webhook" || !!data.WEBHOOK_SECRET_PATH, {
    message: "WEBHOOK_SECRET_PATH (at least 16 characters) is required when BOT_MODE=webhook",
    path: ["WEBHOOK_SECRET_PATH"],
  })
  .refine((data) => data.BOT_MODE !== "webhook" || !!(data.WEBHOOK_URL || data.RENDER_EXTERNAL_URL), {
    message: "WEBHOOK_URL (or RENDER_EXTERNAL_URL, set automatically on Render) is required when BOT_MODE=webhook",
    path: ["WEBHOOK_URL"],
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchemaWithRefinements.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`).join("\n");

    // In tests, throw instead of exiting: process.exit() would kill the runner.
    if (process.env.NODE_ENV === "test") {
      throw new Error(`Invalid environment configuration:\n${details}`);
    }

    // eslint-disable-next-line no-console
    console.error(`❌ Invalid environment configuration:\n${details}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

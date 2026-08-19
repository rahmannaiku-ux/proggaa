import "dotenv/config";
import { z } from "zod";

const providerEnum = z.enum(["mock", "api"]);

// A .env file with a deliberately-blank placeholder line (e.g.
// `WEBHOOK_URL=`, as .env.example has for fields you only need in
// webhook mode) makes dotenv set that var to an empty string, not leave
// it unset. Zod's `.optional()` only treats `undefined` as "not
// provided" — an empty string still gets validated and fails `.url()`
// or `.min()`. These helpers normalize "" to undefined first so blank
// placeholder lines behave the same as omitting the line entirely.
const blankToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optionalString = () => z.preprocess(blankToUndefined, z.string().optional());
const optionalUrl = () => z.preprocess(blankToUndefined, z.string().url().optional());

const envSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),

  PROGGAA_WEB_URL: z.preprocess(
    blankToUndefined,
    z.string().url().default("https://your-proggaa-domain.com")
  ),
  PROGGAA_API_URL: optionalUrl(),
  PROGGAA_API_KEY: optionalString(),

  DATABASE_URL: optionalString(),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  PROGGAA_USER_PROVIDER: providerEnum.default("mock"),
  PROGGAA_COURSE_PROVIDER: providerEnum.default("mock"),
  PROGGAA_EXAM_PROVIDER: providerEnum.default("mock"),
  PROGGAA_RESULT_PROVIDER: providerEnum.default("mock"),
  PROGGAA_PAYMENT_PROVIDER: providerEnum.default("mock"),
  PROGGAA_NOTIFICATION_PROVIDER: providerEnum.default("mock"),
  PROGGAA_AI_PROVIDER: providerEnum.default("mock"),
  PROGGAA_ADMIN_PROVIDER: providerEnum.default("mock"),
  PROGGAA_LINK_PROVIDER: providerEnum.default("mock"),

  DEV_SEED_ADMIN_TELEGRAM_ID: optionalString(),

  // Comma-separated Telegram chat ids (negative numbers for groups/supergroups,
  // e.g. "-1001234567890,-1009876543210") where Group Assistant mode (welcome,
  // FAQ, moderation, announcements) is active. The bot ignores group-specific
  // behavior in any chat not listed here, even if it's added to that group.
  PROGGAA_GROUP_IDS: optionalString(),

  // Directory for the bot's own JSON-file persistence (support tickets,
  // group config, notification preferences). On Render this should be a
  // mounted Disk's path. Leave unset for in-memory-only (e.g. local dev).
  PERSISTENCE_DIR: optionalString(),

  // --- Bot connection mode ---
  // "polling": bot pulls updates from Telegram (simplest for local dev).
  // "webhook": Telegram pushes updates to an HTTP endpoint we expose
  // (needed for free-tier hosts like Render, whose free instance type
  // only supports HTTP web services, not always-on background workers).
  BOT_MODE: z.enum(["polling", "webhook"]).default("polling"),

  // Public base URL Telegram should send webhook requests to, e.g.
  // https://proggaa-bot.onrender.com. Required when BOT_MODE=webhook.
  // Render automatically provides this via RENDER_EXTERNAL_URL, which
  // index.ts falls back to if WEBHOOK_URL isn't set explicitly.
  WEBHOOK_URL: optionalUrl(),
  RENDER_EXTERNAL_URL: optionalUrl(),

  // Random-looking path segment for the webhook route, so the endpoint
  // isn't guessable (Telegram doesn't sign requests). Required when
  // BOT_MODE=webhook. Generate one with: openssl rand -hex 20
  WEBHOOK_SECRET_PATH: z.preprocess(blankToUndefined, z.string().min(8).optional()),

  // Port the HTTP server listens on in webhook mode. Render sets this
  // automatically; PORT here is just the fallback for local testing.
  PORT: z.coerce.number().default(3000),
});

const envSchemaWithRefinements = envSchema
  .refine((data) => data.BOT_MODE !== "webhook" || !!data.WEBHOOK_SECRET_PATH, {
    message: "WEBHOOK_SECRET_PATH is required when BOT_MODE=webhook",
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

    // In tests, throw instead of exiting the whole process — a hard
    // process.exit() here would kill the test runner itself, not just
    // fail the assertion, and would be very confusing to debug.
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
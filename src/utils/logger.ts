import { env } from "../config/env";

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Fields that must never be logged, even accidentally. Any log `meta`
 * object is scrubbed of these keys before being written anywhere.
 */
const REDACTED_KEYS = new Set([
  "password",
  "token",
  "linkToken",
  "apiKey",
  "api_key",
  "botToken",
  "authorization",
  "secret",
]);

function redact(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return meta;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (REDACTED_KEYS.has(key)) {
      clean[key] = "[REDACTED]";
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[env.LOG_LEVEL]) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...redact(meta),
  };
  const line = JSON.stringify(entry);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => write("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => write("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write("error", message, meta),
  /** Dedicated channel for security-sensitive actions (payments, admin actions, linking). */
  audit: (action: string, meta?: Record<string, unknown>) =>
    write("info", `AUDIT: ${action}`, meta),
};

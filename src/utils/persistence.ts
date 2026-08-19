import fs from "node:fs";
import path from "node:path";
import { logger } from "./logger";
import { env } from "../config/env";

/**
 * A tiny JSON-file-backed store for the bot's own state (support tickets,
 * group config, notification preferences, ...) — NOT for anything that
 * belongs in the real Proggaa database, and NOT a substitute for a real
 * DB at scale. This exists so a Render redeploy doesn't silently wipe
 * every open support ticket and every student's mute preferences.
 *
 * Enabled by setting PERSISTENCE_DIR to a writable, persistent path (on
 * Render: a mounted Disk). When unset, everything behaves exactly as
 * before — in-memory only, reset on restart — so local dev needs no setup.
 */
export class FileStore<T> {
  readonly data: T;
  private readonly filePath: string | null;

  constructor(filename: string, defaultValue: T) {
    const dir = env.PERSISTENCE_DIR;
    this.filePath = dir ? path.join(dir, filename) : null;
    this.data = this.load(defaultValue);
  }

  private load(defaultValue: T): T {
    if (!this.filePath) return defaultValue;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        return { ...defaultValue, ...JSON.parse(raw) };
      }
    } catch (error) {
      logger.warn("persistence.load_failed", { file: this.filePath, error: String(error) });
    }
    return defaultValue;
  }

  /** Call after mutating `.data` in place to persist the change. No-op (and cheap) when PERSISTENCE_DIR isn't set. */
  save(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data), "utf8");
    } catch (error) {
      // Never let a disk write failure break the request that triggered
      // it — the in-memory state is already correct either way.
      logger.warn("persistence.save_failed", { file: this.filePath, error: String(error) });
    }
  }
}

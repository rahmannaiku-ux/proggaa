import { z } from "zod";

/**
 * Validation for anything that arrives from Telegram: message text and the ids
 * inside button (callback) data. None of it is trusted, and an id that passes
 * here is still only ever sent to the website, which does its own checks.
 */

// Proggaa ids are cuids (letters and digits); the bot's own ids use "_" and "-".
export const ENTITY_ID_PATTERN = "[A-Za-z0-9_-]{1,64}";

const entityIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "must contain only letters, digits, underscores, and hyphens");

export function isValidEntityId(id: string): boolean {
  return entityIdSchema.safeParse(id).success;
}

/** Telegram refuses callback data over 64 bytes; anything longer did not come from our buttons. */
export const CALLBACK_DATA_MAX_BYTES = 64;

export function isPlausibleCallbackData(data: string): boolean {
  return Buffer.byteLength(data, "utf8") <= CALLBACK_DATA_MAX_BYTES && !/[\u0000-\u001f]/.test(data);
}

export const TEXT_LIMITS = {
  linkCode: 64,
  note: 1000,
  searchQuery: 80,
  couponCode: 40,
  transactionId: 20,
  heroIdentifier: 120,
  announcementTitle: 120,
  announcementBody: 1000,
  rejectReason: 500,
  groupAnnouncement: 1000,
} as const;

const nonEmptyTrimmed = (max: number) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "cannot be empty")
    .refine((s) => s.length <= max, `must be ${max} characters or fewer`);

export function validateBoundedText(
  raw: string,
  max: number
): { ok: true; value: string } | { ok: false; error: string } {
  const result = nonEmptyTrimmed(max).safeParse(raw);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0]?.message ?? "invalid input" };
}

/** A link code looks like XXXX-XXXX-XXXX; reject anything else before it reaches the website. */
export function normalizeLinkCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code) ? code : null;
}

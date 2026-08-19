import { z } from "zod";

/**
 * Centralized validation so every handler that trusts a callback-query
 * payload or a free-text message runs it through the same rules, instead
 * of each file inventing its own regex. Keeping these as small named
 * exports also makes them independently unit-testable.
 */

/** Proggaa entity ids as used throughout mock data, e.g. "pay_1", "exam_physics_midterm". */
const entityIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9_-]+$/, "must contain only letters, digits, underscores, and hyphens");

export function isValidEntityId(id: string): boolean {
  return entityIdSchema.safeParse(id).success;
}

/** Free-text limits, used to stop a single message from being pasted in as an abuse vector. */
export const TEXT_LIMITS = {
  supportMessage: 2000,
  aiTopic: 200,
  aiSourceText: 8000,
  aiFileRef: 200,
  announcementMessage: 1000,
  transactionId: 100,
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

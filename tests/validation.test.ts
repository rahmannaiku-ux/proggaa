import { describe, expect, it } from "vitest";
import { isValidEntityId, validateBoundedText, TEXT_LIMITS } from "../src/utils/validation";

describe("isValidEntityId", () => {
  it("accepts typical mock entity ids", () => {
    expect(isValidEntityId("pay_1")).toBe(true);
    expect(isValidEntityId("exam_physics_midterm")).toBe(true);
    expect(isValidEntityId("qb_100")).toBe(true);
  });

  it("rejects empty strings", () => {
    expect(isValidEntityId("")).toBe(false);
  });

  it("rejects ids with path-like or injection characters", () => {
    expect(isValidEntityId("../etc/passwd")).toBe(false);
    expect(isValidEntityId("pay_1; DROP TABLE payments")).toBe(false);
    expect(isValidEntityId("<script>")).toBe(false);
  });

  it("rejects ids longer than 64 characters", () => {
    expect(isValidEntityId("a".repeat(65))).toBe(false);
  });

  it("accepts ids exactly at the 64 character limit", () => {
    expect(isValidEntityId("a".repeat(64))).toBe(true);
  });
});

describe("validateBoundedText", () => {
  it("trims and accepts text within the limit", () => {
    const result = validateBoundedText("  hello world  ", 50);
    expect(result).toEqual({ ok: true, value: "hello world" });
  });

  it("rejects empty or whitespace-only text", () => {
    const result = validateBoundedText("   ", 50);
    expect(result.ok).toBe(false);
  });

  it("rejects text over the limit", () => {
    const result = validateBoundedText("a".repeat(TEXT_LIMITS.supportMessage + 1), TEXT_LIMITS.supportMessage);
    expect(result.ok).toBe(false);
  });

  it("accepts text exactly at the limit", () => {
    const result = validateBoundedText("a".repeat(TEXT_LIMITS.aiTopic), TEXT_LIMITS.aiTopic);
    expect(result.ok).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  CALLBACK_DATA_MAX_BYTES,
  TEXT_LIMITS,
  isPlausibleCallbackData,
  isValidEntityId,
  normalizeLinkCode,
  validateBoundedText,
} from "../src/utils/validation";

describe("entity ids", () => {
  it("accepts cuid-style ids and rejects anything else", () => {
    expect(isValidEntityId("cmupg4f2r0001potwtsprguon")).toBe(true);
    expect(isValidEntityId("pay_1")).toBe(true);
    for (const bad of ["", "a b", "../etc/passwd", "id;DROP TABLE", "x".repeat(65), "id\n", "<script>"]) {
      expect(isValidEntityId(bad)).toBe(false);
    }
  });
});

describe("callback data", () => {
  it("rejects data longer than Telegram allows or with control characters", () => {
    expect(isPlausibleCallbackData("menu:home")).toBe(true);
    expect(isPlausibleCallbackData("x".repeat(CALLBACK_DATA_MAX_BYTES))).toBe(true);
    expect(isPlausibleCallbackData("x".repeat(CALLBACK_DATA_MAX_BYTES + 1))).toBe(false);
    expect(isPlausibleCallbackData("menu:home\u0000")).toBe(false);
  });
});

describe("link codes", () => {
  it("accepts the website's XXXX-XXXX-XXXX format, in any case, with spaces around it", () => {
    expect(normalizeLinkCode("nkvy-5rr3-mt68")).toBe("NKVY-5RR3-MT68");
    expect(normalizeLinkCode("  NKVY-5RR3-MT68 \n")).toBe("NKVY-5RR3-MT68");
  });

  it("rejects anything that is not a link code", () => {
    for (const bad of ["", "hello", "NKVY5RR3MT68", "NKVY-5RR3", "NKVY-5RR3-MT68-EXTRA", "NKVY-5RR3-MT6!", "/start"]) {
      expect(normalizeLinkCode(bad)).toBeNull();
    }
  });
});

describe("bounded text", () => {
  it("trims, and rejects empty or too long input", () => {
    expect(validateBoundedText("  hello  ", 10)).toEqual({ ok: true, value: "hello" });
    expect(validateBoundedText("   ", 10).ok).toBe(false);
    expect(validateBoundedText("x".repeat(TEXT_LIMITS.rejectReason + 1), TEXT_LIMITS.rejectReason).ok).toBe(false);
  });
});

describe("logging never leaks secrets", () => {
  it("scrubs anything shaped like a bot token, even inside an error message", async () => {
    const { scrub, redact } = await import("../src/utils/logger");
    const token = "1234567890:" + "A".repeat(35); // token-shaped, not a real token
    expect(scrub(`request to https://api.telegram.org/bot${token}/getMe failed`)).toBe("request to https://api.telegram.org/bot[bot-token]/getMe failed");
    expect(redact({ error: `bad ${token}`, token: "x", apiKey: "y", telegramId: "1" })).toEqual({
      error: "bad [bot-token]",
      token: "[REDACTED]",
      apiKey: "[REDACTED]",
      telegramId: "1",
    });
  });
});

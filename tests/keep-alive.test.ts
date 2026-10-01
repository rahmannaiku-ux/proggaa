import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startKeepAlive } from "../src/utils/keepAlive";

describe("startKeepAlive", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("requests the URL on every interval and stops when asked", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    const stop = startKeepAlive("https://bot.example/healthz", 1000, fetchMock as unknown as typeof fetch);

    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls as unknown[][])[0]![0]).toBe("https://bot.example/healthz");

    stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps going after a failed ping", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue(new Response("ok"));
    const stop = startKeepAlive("https://bot.example/healthz", 1000, fetchMock as unknown as typeof fetch);

    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });
});

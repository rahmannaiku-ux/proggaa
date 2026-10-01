import { logger } from "./logger";

/**
 * Render's free web services go to sleep after about 15 minutes without
 * inbound web traffic, and the next request then waits ~50 seconds for a cold
 * start. A request to the service's own public URL arrives through Render's
 * proxy like any other visitor, so asking for /healthz now and then keeps it
 * awake. This only runs while the process is up; it cannot wake a sleeping one.
 *
 * Returns a function that stops the timer.
 */
export function startKeepAlive(
  url: string,
  intervalMs = 10 * 60 * 1000,
  fetchImpl: typeof fetch = fetch
): () => void {
  const ping = async () => {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
      logger.debug("keepalive.ok", { status: res.status });
    } catch (error) {
      logger.warn("keepalive.failed", { error: error instanceof Error ? error.message : String(error) });
    }
  };

  const timer = setInterval(() => void ping(), intervalMs);
  timer.unref(); // never keeps the process alive on its own
  return () => clearInterval(timer);
}

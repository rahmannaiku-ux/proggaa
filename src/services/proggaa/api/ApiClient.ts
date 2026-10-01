import {
  NotFoundError,
  ProggaaServiceError,
  ProggaaUnavailableError,
  UnauthorizedError,
  ValidationError,
} from "../errors";

export type FetchLike = typeof fetch;

/** Extra detail attached to errors thrown for a non-2xx answer from the website. */
export interface ApiError {
  status: number;
  apiCode?: string;
}

export function apiErrorOf(error: unknown): Partial<ApiError> {
  const e = error as Partial<ApiError> | null;
  return { status: e?.status, apiCode: e?.apiCode };
}

/**
 * Thin HTTP client for the Proggaa website's /api/bot/* and /api/telegram/*
 * routes. Every request carries the shared X-Api-Key (PROGGAA_API_KEY), which
 * proves the call comes from this bot server. Who the call is *about* is always
 * passed explicitly (userId / teacherId / adminUserId) and re-checked by the
 * website, which refuses accounts that were never linked to Telegram.
 *
 * Error handling: a 404 on a GET means "no such thing" and resolves to null;
 * everything else that is not a 2xx becomes a typed ProggaaServiceError so the
 * bot's global error handler can show a friendly message.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly timeoutMs = 10_000
  ) {
    if (!baseUrl) throw new Error("ApiClient: PROGGAA_API_URL is required when a provider is set to \"api\".");
    if (!apiKey) throw new Error("ApiClient: PROGGAA_API_KEY is required when a provider is set to \"api\".");
  }

  /** GET that resolves to null when the website answers 404. */
  async get<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T | null> {
    const res = await this.request("GET", this.url(path, query));
    if (res.status === 404) return null;
    return this.parse<T>(res);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request("POST", this.url(path), body);
    return this.parse<T>(res);
  }

  async delete<T>(path: string, body: unknown): Promise<T> {
    const res = await this.request("DELETE", this.url(path), body);
    return this.parse<T>(res);
  }

  private url(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(path, this.baseUrl.endsWith("/") ? this.baseUrl : `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request(method: string, url: string, body?: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        method,
        headers: {
          "X-Api-Key": this.apiKey,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ProggaaUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.ok) {
      return (await res.json().catch(() => null)) as T;
    }

    const payload = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    const message = payload?.error;

    // `status` and `apiCode` (the website's own code, e.g. "EXPIRED_TOKEN") ride
    // along so a caller that needs to tell failures apart can, see ApiError.
    const tag = <E extends Error>(err: E): E & ApiError => Object.assign(err, { status: res.status, apiCode: payload?.code });

    if (res.status === 401) {
      throw tag(new ProggaaServiceError("The Proggaa website rejected the bot's API key.", "BOT_API_AUTH"));
    }
    if (res.status === 403) throw tag(new UnauthorizedError(message));
    if (res.status === 404) {
      // The website's own sentence is already complete; NotFoundError would add " not found." to it.
      const notFound = new NotFoundError(message ?? "That item");
      if (message) notFound.message = message;
      throw tag(notFound);
    }
    if (res.status === 400 || res.status === 409 || res.status === 410 || res.status === 429) {
      // The website's own wording is written for people, so pass it on.
      throw tag(new ValidationError(message ?? "The request was not accepted."));
    }
    throw new ProggaaUnavailableError();
  }
}

/**
 * Common error types thrown by Proggaa service implementations (mock or real).
 * Bot-layer code should catch these and turn them into user-friendly
 * Telegram messages rather than leaking stack traces.
 */

export class ProggaaServiceError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "ProggaaServiceError";
  }
}

export class ProggaaUnavailableError extends ProggaaServiceError {
  constructor(message = "The Proggaa service is temporarily unavailable.") {
    super(message, "PROGGAA_UNAVAILABLE");
    this.name = "ProggaaUnavailableError";
  }
}

export class NotFoundError extends ProggaaServiceError {
  constructor(what: string) {
    super(`${what} not found.`, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends ProggaaServiceError {
  constructor(message = "You are not authorized to do that.") {
    super(message, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ValidationError extends ProggaaServiceError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class InvalidOrExpiredTokenError extends ProggaaServiceError {
  constructor(message = "This link token is invalid or has expired.") {
    super(message, "INVALID_TOKEN");
    this.name = "InvalidOrExpiredTokenError";
  }
}

export class AlreadyLinkedError extends ProggaaServiceError {
  constructor(message = "This Telegram account is already linked to a Proggaa account.") {
    super(message, "ALREADY_LINKED");
    this.name = "AlreadyLinkedError";
  }
}

export class AccountMismatchError extends ProggaaServiceError {
  constructor(message = "This token belongs to a different Proggaa account.") {
    super(message, "ACCOUNT_MISMATCH");
    this.name = "AccountMismatchError";
  }
}

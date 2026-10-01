import { createHmac, timingSafeEqual } from "node:crypto";
import type { NotificationEvent, NotificationEventType } from "../../types/domain";
import type { ProggaaNotificationService } from "../proggaa/interfaces";
import { logger } from "../../utils/logger";

/**
 * Receives the events the Proggaa website sends the bot (see the website's
 * lib/bot-webhook/dispatch.ts): an exam is scheduled or starting, results are
 * published, a payment is approved or rejected, a new announcement.
 *
 * Each request is a JSON envelope signed with HMAC-SHA256 of the raw body using
 * the shared PROGGAA_BOT_WEBHOOK_SECRET, sent in the X-Proggaa-Signature header.
 * Anything with a missing or wrong signature is rejected before it is parsed,
 * and an event id that was already handled is acknowledged but not pushed twice.
 */

type WebsiteEvent =
  | { type: "EXAM_SCHEDULED"; proggaaUserId: string; payload: { assessmentId: string; title: string; opensAt: string } }
  | { type: "EXAM_STARTING"; proggaaUserId: string; payload: { assessmentId: string; title: string; startsInMinutes: number } }
  | { type: "EXAM_RESULTS_PUBLISHED"; proggaaUserId: string; payload: { assessmentId: string; title: string; percentage: number; isPassed: boolean } }
  | { type: "PAYMENT_APPROVED"; proggaaUserId: string; payload: { paymentId: string; courseTitle: string } }
  | { type: "PAYMENT_REJECTED"; proggaaUserId: string; payload: { paymentId: string; courseTitle: string; reason: string } }
  | { type: "NEW_ANNOUNCEMENT"; proggaaUserId: string; payload: { announcementId: string; courseTitle: string | null; title: string } };

interface Envelope {
  eventId: string;
  sentAt: string;
  event: WebsiteEvent;
}

export interface ReceiverResult {
  status: 200 | 400 | 401 | 503;
  body: string;
}

const MAX_REMEMBERED_EVENTS = 1000;

function dhakaTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** Escapes the characters Telegram's legacy Markdown treats as formatting, for text we did not write. */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, "\\$1");
}

export function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function toNotificationEvent(event: WebsiteEvent): NotificationEvent {
  const userId = event.proggaaUserId;
  switch (event.type) {
    case "EXAM_SCHEDULED":
      return {
        type: "EXAM_SCHEDULED",
        userId,
        category: "EXAM_REMINDERS",
        title: "📅 Exam scheduled",
        body: `${escapeMarkdown(event.payload.title)} opens ${dhakaTime(event.payload.opensAt)}.`,
        data: { examId: event.payload.assessmentId },
      };
    case "EXAM_STARTING": {
      const minutes = event.payload.startsInMinutes;
      const type: NotificationEventType =
        minutes <= 10 ? "EXAM_REMINDER_10_MIN" : minutes <= 60 ? "EXAM_REMINDER_1_HOUR" : "EXAM_REMINDER_1_DAY";
      return {
        type,
        userId,
        category: "EXAM_REMINDERS",
        title: "⏰ Exam starting soon",
        body: `${escapeMarkdown(event.payload.title)} starts in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        data: { examId: event.payload.assessmentId },
      };
    }
    case "EXAM_RESULTS_PUBLISHED":
      return {
        type: "RESULTS_PUBLISHED",
        userId,
        category: "RESULTS",
        title: event.payload.isPassed ? "🎉 Result published" : "📊 Result published",
        body: `${escapeMarkdown(event.payload.title)}: ${Math.round(event.payload.percentage * 10) / 10}% (${event.payload.isPassed ? "passed" : "not passed"}).`,
        data: { examId: event.payload.assessmentId },
      };
    case "PAYMENT_APPROVED":
      return {
        type: "PAYMENT_APPROVED",
        userId,
        category: "PAYMENTS",
        title: "✅ Payment approved",
        body: `${escapeMarkdown(event.payload.courseTitle)} is unlocked. Happy learning!`,
        data: { paymentId: event.payload.paymentId },
      };
    case "PAYMENT_REJECTED":
      return {
        type: "PAYMENT_REJECTED",
        userId,
        category: "PAYMENTS",
        title: "❌ Payment rejected",
        body: `${escapeMarkdown(event.payload.courseTitle)}: ${escapeMarkdown(event.payload.reason)}`,
        data: { paymentId: event.payload.paymentId },
      };
    case "NEW_ANNOUNCEMENT":
      return {
        type: "NEW_ANNOUNCEMENT",
        userId,
        category: "COURSE_UPDATES",
        title: "📢 New announcement",
        body: event.payload.courseTitle
          ? `${escapeMarkdown(event.payload.courseTitle)}: ${escapeMarkdown(event.payload.title)}`
          : escapeMarkdown(event.payload.title),
        data: { announcementId: event.payload.announcementId },
      };
  }
}

export class ProggaaEventReceiver {
  private readonly seen = new Set<string>();

  constructor(
    private readonly notifications: ProggaaNotificationService,
    private readonly secret: string | undefined
  ) {}

  async handle(rawBody: string, signature: string | undefined): Promise<ReceiverResult> {
    if (!this.secret) return { status: 503, body: "Event receiver is not configured." };
    if (!verifySignature(rawBody, signature, this.secret)) return { status: 401, body: "Bad signature." };

    let envelope: Envelope;
    try {
      envelope = JSON.parse(rawBody) as Envelope;
    } catch {
      return { status: 400, body: "Invalid JSON." };
    }
    if (!envelope?.eventId || !envelope.event?.type || !envelope.event.proggaaUserId) {
      return { status: 400, body: "Malformed event." };
    }

    if (this.seen.has(envelope.eventId)) return { status: 200, body: "Already handled." };
    this.seen.add(envelope.eventId);
    if (this.seen.size > MAX_REMEMBERED_EVENTS) {
      this.seen.delete(this.seen.values().next().value as string);
    }

    try {
      await this.notifications.dispatch(toNotificationEvent(envelope.event));
    } catch (error) {
      // The push is best effort and must never make the website retry forever.
      logger.warn("events.dispatch_failed", {
        type: envelope.event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { status: 200, body: "ok" };
  }
}

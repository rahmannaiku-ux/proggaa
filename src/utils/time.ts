/**
 * Bangladesh Standard Time (BST, UTC+06:00).
 *
 * Proggaa shows every user-facing time in Bangladesh time and Bangladesh has no
 * daylight saving, so the bot does the same. A server (Render runs in UTC) must
 * never decide how a time reads: every date shown in Telegram goes through the
 * helpers in this file, and no other file should call toLocaleString,
 * getHours or similar on a date a user will read.
 */

export const BST_TIME_ZONE = "Asia/Dhaka";
export const BST_OFFSET_MINUTES = 6 * 60;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: BST_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: BST_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: BST_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "Fri, 2 Oct, 9:30 pm" in Bangladesh time. */
export function formatBstDateTime(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return `${dateTimeFormat.format(date).replace(/\s(am|pm)$/i, (m) => m.toLowerCase())} BST`;
}

/** "2 Oct 2026" in Bangladesh time. */
export function formatBstDate(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "unknown date";
  return dateFormat.format(date);
}

/** "9:30 pm" in Bangladesh time. */
export function formatBstTime(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return `${timeFormat.format(date).replace(/\s(am|pm)$/i, (m) => m.toLowerCase())}`;
}

/** The Bangladesh calendar day of an instant, as "YYYY-MM-DD". */
export function bstDateKey(value: Date | string | number): string {
  const shifted = new Date(toDate(value).getTime() + BST_OFFSET_MINUTES * MINUTE_MS);
  return shifted.toISOString().slice(0, 10);
}

/** The instant at which the Bangladesh calendar day of `value` began (00:00 BST). */
export function startOfBstDay(value: Date | string | number = new Date()): Date {
  const date = toDate(value);
  const shifted = date.getTime() + BST_OFFSET_MINUTES * MINUTE_MS;
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStartShifted - BST_OFFSET_MINUTES * MINUTE_MS);
}

/** Whole Bangladesh calendar days from `from` to `to` (0 = same day, 1 = tomorrow). */
export function bstDayDiff(from: Date | string | number, to: Date | string | number): number {
  return Math.round((startOfBstDay(to).getTime() - startOfBstDay(from).getTime()) / DAY_MS);
}

/** "in 5 min", "2h ago", "in 3d": how far an instant is from `now`. */
export function relativeTime(value: Date | string | number, now: Date | number = new Date()): string {
  const diffMs = toDate(value).getTime() - toDate(now).getTime();
  const future = diffMs >= 0;
  const minutes = Math.round(Math.abs(diffMs) / MINUTE_MS);

  let text: string;
  if (minutes < 1) return "now";
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 24 * 60) text = `${Math.round(minutes / 60)}h`;
  else text = `${Math.round(minutes / (24 * 60))}d`;

  return future ? `in ${text}` : `${text} ago`;
}

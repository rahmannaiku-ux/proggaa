/**
 * Proggaa's look and words, translated for Telegram.
 *
 * The website's palette is warm cream #FCF9F3, ink #19122B, primary purple
 * #53328B, accent purple #6B1FC1, XP gold #FAB719 and danger/streak red
 * #BC2A1A. Telegram messages cannot be coloured, so the same colours appear as
 * matching emoji, used the same way everywhere:
 *
 *   purple  🟣  headings and navigation      gold  ⭐ XP, 🪙 Proggy Coins
 *   red     🔥  streaks, 🔴 live, warnings    green ✅ done (the web has no green, Telegram needs a tick)
 *
 * Words follow the product, not the database: Mission, Operation, Patrol,
 * Encounter (exam), Challenge (assignment), Medal (certificate), Hero
 * (student), Mentor (teacher). Code and API keep the plain names.
 */

export const BRAND_NAME = "Proggaa";

export const ICON = {
  brand: "🟣",
  mission: "🚀",
  encounter: "⚔️",
  result: "📊",
  medal: "🏅",
  achievement: "🏆",
  xp: "⭐",
  coins: "🪙",
  level: "🛡️",
  streak: "🔥",
  live: "🔴",
  liveSoon: "🟡",
  done: "✅",
  warn: "⚠️",
  danger: "❌",
  bell: "🔔",
  wallet: "👛",
  payment: "💳",
  clock: "🕘",
  link: "🔗",
  help: "❓",
  settings: "⚙️",
  mentor: "🧑‍🏫",
  admin: "🛠️",
} as const;

export const TERMS = {
  course: "Mission",
  courses: "Missions",
  module: "Operation",
  lesson: "Patrol",
  exam: "Encounter",
  exams: "Encounters",
  assignment: "Challenge",
  certificate: "Medal",
  student: "Hero",
  teacher: "Mentor",
  coins: "Proggy Coins",
} as const;

/** Escapes the characters Telegram's Markdown mode reads as formatting, for text we did not write. */
export function esc(text: string): string {
  return text.replace(/([_*`[\]])/g, "\\$1");
}

/** A screen title: purple mark, bold title. */
export function heading(icon: string, title: string): string {
  return `${ICON.brand} ${icon} *${esc(title)}*`;
}

/** ▰▰▰▱▱: filled blocks for progress, empty blocks for what is left. */
export function progressBar(percent: number, length = 10): string {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const filled = Math.round((clamped / 100) * length);
  return "▰".repeat(filled) + "▱".repeat(length - filled);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Taka, the only currency Proggaa uses. */
export function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

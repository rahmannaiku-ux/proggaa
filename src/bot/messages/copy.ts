import { ICON, esc } from "./brand";

/**
 * All the fixed wording of the bot lives here, so tone and Proggaa's words
 * (Mission, Patrol, Encounter, Hero, Mentor, Proggy Coins) stay consistent.
 */

export const BRAND = `${ICON.brand} *Proggaa*`;

export const WELCOME_LINKED = (name: string) =>
  `${BRAND}\n\nWelcome back, ${esc(name)}! ${ICON.xp}\n\n` +
  `Your Missions, Encounters, Proggy Coins and live classes are one tap away.\n` +
  `Send /dashboard to jump in, or /help to see everything I can do.`;

export const WELCOME_UNLINKED =
  `${BRAND}\n\nI'm your Proggaa companion on Telegram.\n\n` +
  `Once you connect your account I can show your Missions and progress, your XP and Proggy Coins, ` +
  `upcoming Encounters and live classes, and send you the same notifications you get on the website.\n\n` +
  `Tap *Connect Proggaa* to begin, or send /link.`;

export const HELP_TEXT = (role: "STUDENT" | "TEACHER" | "ADMIN" | "NONE") => {
  const lines = [
    `${BRAND} *Help*`,
    "",
    "*Everyone*",
    "/start — main menu",
    "/link — connect your Proggaa account",
    "/unlink — disconnect it",
    "/help — this list",
  ];
  if (role !== "NONE") {
    lines.push(
      "",
      "*Study*",
      "/dashboard — level, XP, Proggy Coins and what is next",
      "/missions — your Missions: open one to see its Operations and Patrols",
      "/exams  /results — your Encounters and results",
      "/live — live and upcoming live classes",
      "/calendar — your upcoming classes, events and deadlines",
      "",
      "*Join and buy*",
      "/browse — find Missions, join free ones or pay for the rest",
      "/search — search Missions by name",
      "/payments — your payments; send a Transaction ID",
      "",
      "*Rewards*",
      "/wallet — Proggy Coins",
      "/store — spend Proggy Coins",
      "/leaderboard  /medals  /achievements  /progress  /studyplan",
      "",
      "*Updates*",
      "/notifications  /announcements  /settings  /support"
    );
  }
  if (role === "TEACHER" || role === "ADMIN") lines.push("", "*Mentor*", "/teacher — your Missions, Encounters and grading");
  if (role === "ADMIN") lines.push("", "*Admin*", "/admin — admin tools", "/payments — payments waiting for verification", "/stats — platform numbers");
  return lines.join("\n");
};

export const LINK_INTRO =
  `${BRAND} *Connect your account*\n\n` +
  `1️⃣ Open Proggaa and sign in\n` +
  `2️⃣ Go to *Settings → Telegram* (${esc("/settings/telegram")})\n` +
  `3️⃣ Press *Generate code*\n` +
  `4️⃣ Send the code here\n\n` +
  `I never ask for your password. The code works once and expires after 10 minutes.`;

export const LINK_ALREADY_LINKED =
  `${ICON.done} This Telegram account is already connected to Proggaa. Use /unlink first to connect a different account.`;

export const LINK_SUCCESS = (name: string, role: string) =>
  `${ICON.done} *Connected!*\n\nWelcome, ${esc(name)} (${role.toLowerCase()}). Send /dashboard to start.`;

export const LINK_INVALID_OR_EXPIRED =
  `${ICON.danger} That code is invalid, already used, or expired. Generate a new one on Proggaa under Settings → Telegram and try again.`;

export const LINK_ACCOUNT_MISMATCH =
  `${ICON.danger} That code belongs to a different Telegram account. Generate a new code and send it from the account you want to connect.`;

export const UNLINK_CONFIRM = "Disconnect your Proggaa account from this Telegram chat?";
export const UNLINK_SUCCESS = `🔓 Disconnected. Use /link to connect again any time.`;
export const UNLINK_NOT_LINKED = "No Proggaa account is connected to this chat.";

export const NOT_LINKED_PROMPT = `${ICON.link} Connect your Proggaa account first with /link.`;
export const UNAUTHORIZED = `🚫 Your Proggaa role can't use this.`;

export const GENERIC_ERROR = `😕 Something went wrong on our side. Please try again in a moment, or use /support if it keeps happening.`;
export const UNAVAILABLE_ERROR = `${ICON.warn} Proggaa isn't answering right now. Please try again in a minute.`;

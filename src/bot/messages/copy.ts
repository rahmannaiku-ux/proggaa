/**
 * Centralized bot copy. Keeping user-facing text here (rather than inline
 * in handlers) makes tone/branding consistent and easy to review or
 * localize later.
 */

export const BRAND = "🎓 Proggaa";

export const WELCOME_LINKED = (name: string) =>
  `${BRAND} Welcome back, ${name}!\n\n` +
  `Good to see you again. Your dashboard, courses, and exams are just a tap away.\n\n` +
  `Send /dashboard to jump straight in, or /help for the full list of commands.`;

export const WELCOME_UNLINKED =
  `${BRAND} Welcome to Proggaa!\n\n` +
  `I'm your learning companion right here on Telegram — track courses, take exams, ` +
  `check results, and get notified the moment something needs your attention, ` +
  `all without opening the website.\n\n` +
  `Here's what I can do once you're connected:\n` +
  `📚 View your courses and progress\n` +
  `📝 Take exams and see results instantly\n` +
  `🏆 Track your achievements\n` +
  `🔔 Get notified about deadlines and updates\n\n` +
  `Tap *Connect Proggaa* below to link your account, or send /link if you already ` +
  `have a one-time code from the website.\n\n` +
  `Not connected yet? No worries — send /help anytime to see what's available.`;

export const HELP_TEXT =
  `${BRAND} Help\n\n` +
  `*General*\n` +
  `/start — Open the main menu\n` +
  `/link — Connect your Proggaa account\n` +
  `/unlink — Disconnect your Proggaa account\n` +
  `/dashboard — Your personalized dashboard\n` +
  `/courses — Your courses\n` +
  `/exams — Your exams\n` +
  `/results — Your exam results\n` +
  `/achievements — Your unlocked achievements\n` +
  `/notifications — Recent notifications\n` +
  `/settings — Notification preferences\n` +
  `/support — Get help\n\n` +
  `*Teacher*\n` +
  `/teacher — Teacher dashboard\n` +
  `/ai — Generate exam questions\n\n` +
  `*Admin*\n` +
  `/admin — Admin dashboard\n` +
  `/payments — Pending payments\n` +
  `/stats — Platform statistics`;

export const LINK_INTRO =
  `${BRAND} Connect your account\n\n` +
  `1️⃣ Open Proggaa on the website\n` +
  `2️⃣ Go to *Settings → Telegram*\n` +
  `3️⃣ Generate a one-time code\n` +
  `4️⃣ Send that code here\n\n` +
  `We never ask for your password. The code expires after a few minutes.`;

export const LINK_ALREADY_LINKED =
  "✅ Your Telegram account is already connected to Proggaa. Use /unlink first if you want to connect a different account.";

export const LINK_SUCCESS = (name: string, role: string) =>
  `✅ Connected!\n\nWelcome, ${name} (${role}). You now have full access to your Proggaa dashboard here.`;

export const LINK_INVALID_OR_EXPIRED =
  "❌ That code is invalid or has expired. Generate a new one from Proggaa → Settings → Telegram and try again.";

export const LINK_ACCOUNT_MISMATCH =
  "❌ That code belongs to a different Telegram account. Please generate a new code from the account you want to connect.";

export const UNLINK_CONFIRM = "Are you sure you want to disconnect your Proggaa account from Telegram?";
export const UNLINK_SUCCESS = "🔓 Your Proggaa account has been disconnected. Use /link to reconnect anytime.";
export const UNLINK_NOT_LINKED = "You don't currently have a connected Proggaa account.";

export const NOT_LINKED_PROMPT =
  "🔗 This feature needs a connected Proggaa account.\n\nUse /link to connect your account first.";

export const UNAUTHORIZED = "🚫 You don't have permission to use this feature.";

export const GENERIC_ERROR =
  "😕 Something went wrong on our end. Please try again in a moment, or use /support if it keeps happening.";

export const COMING_SOON = (feature: string) =>
  `🚧 ${feature} is coming in a future update. The underlying service interface is already in place — this screen will light up once it's connected to real Proggaa data.`;

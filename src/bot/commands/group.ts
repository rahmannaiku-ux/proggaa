import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { logger } from "../../utils/logger";

interface FaqEntry {
  pattern: RegExp;
  answer: string;
}

// Conservative keyword patterns — the bot only auto-answers in a group when
// a message is clearly directed at it (mention/reply) or is unambiguously
// one of these common questions, and even then only once per match. This is
// deliberately small; false positives are worse than an unanswered question.
const FAQ_ENTRIES: FaqEntry[] = [
  { pattern: /\b(pay|payment|bkash|txid)\b/i, answer: "💳 For payments: open a private chat with me and use /payments to see instructions and check your status." },
  { pattern: /\b(access|can'?t (open|see|watch)|course access)\b/i, answer: "📚 For course access issues: DM me and use /courses, or open a Support ticket via /support." },
  { pattern: /\bwhen.*(exam|test)\b|\bexam.*(date|time|when)\b/i, answer: "📝 For exam schedules: DM me and use /exams to see your upcoming exams." },
  { pattern: /\b(contact support|talk to (a )?human|need help|raise a ticket)\b/i, answer: "🆘 Open a private chat with me and use /support — that keeps your account details out of the group." },
];

function isDirectedAtBot(ctx: ProggaaBotContext, text: string): boolean {
  const repliedToBot =
    ctx.message && "reply_to_message" in ctx.message
      ? (ctx.message as any).reply_to_message?.from?.id === ctx.botInfo?.id
      : false;
  const mentionsBot = ctx.botInfo?.username ? text.toLowerCase().includes(`@${ctx.botInfo.username.toLowerCase()}`) : false;
  return repliedToBot || mentionsBot;
}

const ADMIN_CHECK_TTL_MS = 5 * 60 * 1000;
const adminStatusCache = new Map<string, { canRestrict: boolean; checkedAt: number }>();
/** Chats we've already warned admins about this process lifetime — avoid spamming the same warning on every violation. */
const warnedMissingAdminRights = new Set<string>();

/**
 * Muting only works if the bot itself is a group admin with "Restrict
 * members" — otherwise Telegram just rejects the call and moderation
 * silently does nothing. Checked (and cached briefly) before every mute
 * attempt so a misconfigured group logs one clear warning instead of a
 * confusing per-message failure.
 */
async function botCanRestrictMembers(ctx: ProggaaBotContext, chatId: string): Promise<boolean> {
  const cached = adminStatusCache.get(chatId);
  if (cached && Date.now() - cached.checkedAt < ADMIN_CHECK_TTL_MS) {
    return cached.canRestrict;
  }

  let canRestrict = false;
  try {
    const botId = ctx.botInfo?.id;
    if (botId) {
      const member = await ctx.telegram.getChatMember(Number(chatId), botId);
      canRestrict = member.status === "administrator" && member.can_restrict_members !== false;
    }
  } catch (error) {
    logger.warn("group.admin_rights_check_failed", { chatId, error: String(error) });
  }

  adminStatusCache.set(chatId, { canRestrict, checkedAt: Date.now() });
  if (!canRestrict && !warnedMissingAdminRights.has(chatId)) {
    warnedMissingAdminRights.add(chatId);
    logger.warn("group.moderation_missing_admin_rights", {
      chatId,
      message: "Bot isn't an admin with 'Restrict members' in this group — moderation warnings will still post, but mutes/escalations won't actually restrict anyone until this is fixed in Telegram group settings.",
    });
  }
  return canRestrict;
}

export function registerGroupAssistant(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.on("new_chat_members", async (ctx) => {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId || !services.groupService.isConfiguredGroup(chatId)) return;

    const settings = services.groupService.getSettings(chatId);
    if (!settings.welcomeEnabled) return;

    const members = "new_chat_members" in ctx.message ? ctx.message.new_chat_members : [];
    for (const member of members) {
      if (member.is_bot) continue;
      await ctx.reply(
        [
          `👋 Welcome, ${member.first_name}!`,
          "",
          "This is the Proggaa community group. A few quick things:",
          "• Keep it on-topic and be respectful",
          "• For anything involving your account, payments, or exam results, message me privately instead of posting here",
          "• Common commands to try in a DM: /courses, /exams, /support",
        ].join("\n"),
        Markup.inlineKeyboard([[Markup.button.callback("❓ Group FAQ", "grouphelp:faq")]])
      );
    }
  });

  bot.action("grouphelp:faq", async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply(
      '💬 Ask things like "how do I pay?" or "when is the exam?" and I\'ll try to help — or DM me directly for anything personal.'
    );
  });

  // Group FAQ + moderation. Registered before the text router so it only
  // ever sees updates from configured groups (private-chat text still
  // flows to the text router as before).
  bot.on("text", async (ctx, next) => {
    if (ctx.chatMode !== "configured_group") return next();

    const chatId = ctx.chat!.id.toString();
    const telegramId = ctx.from?.id?.toString();
    const text = ctx.message.text;
    const settings = services.groupService.getSettings(chatId);

    if (settings.moderationEnabled && telegramId) {
      const isFlooding = services.groupService.recordMessageAndCheckFlood(chatId, telegramId);
      const spamReason = services.groupService.matchesSpamPattern(chatId, text);
      const reason = spamReason ?? (isFlooding ? "sending messages too quickly" : null);

      if (reason) {
        const action = services.groupService.recordViolation(chatId, telegramId, reason);
        await handleModerationAction(ctx, services, chatId, telegramId, reason, action);
        return; // don't also run FAQ matching on a flagged message
      }
    }

    if (settings.faqEnabled) {
      const directed = isDirectedAtBot(ctx, text);
      const match = FAQ_ENTRIES.find((entry) => entry.pattern.test(text));
      if (match && (directed || text.includes("?"))) {
        await ctx.reply(
          match.answer,
          Markup.inlineKeyboard([[Markup.button.callback("🆘 More help", "grouphelp:faq")]])
        );
      }
    }

    return next();
  });
}

async function handleModerationAction(
  ctx: ProggaaBotContext,
  services: ServiceContainer,
  chatId: string,
  telegramId: string,
  reason: string,
  action: "WARNING" | "TEMP_MUTE" | "ADMIN_ALERT"
) {
  if (action === "WARNING") {
    await ctx.reply(`⚠️ ${ctx.from?.first_name ?? "there"}, please avoid ${reason}. This is a warning.`);
    return;
  }

  // TEMP_MUTE and ADMIN_ALERT both restrict the member — ADMIN_ALERT is a
  // mute plus an escalation, never an automatic ban.
  const canRestrict = await botCanRestrictMembers(ctx, chatId);
  if (canRestrict) {
    try {
      await ctx.telegram.restrictChatMember(Number(chatId), Number(telegramId), {
        permissions: { can_send_messages: false },
        until_date: Math.floor(Date.now() / 1000) + 10 * 60,
      });
    } catch (error) {
      // Telegram may still reject the specific call even when the bot has
      // admin rights (e.g. target is also an admin) — never let that
      // crash message handling.
      logger.warn("group.moderation_restrict_failed", { chatId, telegramId, error: String(error) });
    }
  }

  if (action === "TEMP_MUTE") {
    await ctx.reply(
      canRestrict
        ? `🔇 ${ctx.from?.first_name ?? "A member"} has been temporarily muted (repeated ${reason}).`
        : `⚠️ ${ctx.from?.first_name ?? "A member"} would normally be muted now for repeated ${reason}, but I'm not an admin here yet — an admin should mute them manually and give me "Restrict members" rights.`
    );
  } else {
    await ctx.reply(`🚨 ${ctx.from?.first_name ?? "A member"}'s repeated violations have been escalated to admins.`);
    logger.audit("group.escalated_to_admin", { chatId, telegramId, reason });
  }
}

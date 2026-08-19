import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { TutorMode } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireLinked } from "../middleware/guards";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { startWizard, clearWizard } from "../handlers/wizard";
import { validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { logger } from "../../utils/logger";

const MODE_LABELS: Record<TutorMode, string> = {
  EXPLAIN_TOPIC: "📘 Explain a Topic",
  SUMMARIZE_LESSON: "📝 Summarize a Lesson",
  HINT: "💡 Give Me a Hint",
  FLASHCARDS: "🗂️ Create Flashcards",
  REVISION_SESSION: "📅 Create a Revision Session",
};

const MODE_PROMPTS: Record<TutorMode, string> = {
  EXPLAIN_TOPIC: "✍️ What topic or concept should I explain?",
  SUMMARIZE_LESSON: "✍️ Which lesson should I summarize? (name it as best you can)",
  HINT: "✍️ What question or topic do you want a hint for?",
  FLASHCARDS: "✍️ What topic should the flashcards cover?",
  REVISION_SESSION: "✍️ What topic is this revision session for?",
};

export function registerStudyCommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("study", async (ctx) => {
    if (await requireLinked(ctx)) return;
    await sendStudyMenu(ctx, services);
  });

  bot.action("menu:study", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    await sendStudyMenu(ctx, services);
  });

  bot.action(/^study:mode:(EXPLAIN_TOPIC|SUMMARIZE_LESSON|HINT|FLASHCARDS|REVISION_SESSION)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    if (await blockDuringActiveExam(ctx, services)) return;

    const mode = ctx.match[1] as TutorMode;
    startWizard(ctx, "study", "awaiting_topic", { mode });
    await ctx.reply(MODE_PROMPTS[mode]);
  });

  bot.action("study:practice", async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireLinked(ctx)) return;
    if (await blockDuringActiveExam(ctx, services)) return;

    startWizard(ctx, "study", "awaiting_practice_topic", {});
    await ctx.reply("✍️ What topic should the practice questions cover?");
  });

  bot.action("study:practice:more", async (ctx) => {
    await ctx.answerCbQuery("Generating...");
    if (await requireLinked(ctx)) return;
    if (await blockDuringActiveExam(ctx, services)) return;

    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "study" || !wizard.data.topic) {
      await ctx.reply("That session expired. Please start again from Study Assistant.");
      return;
    }
    await generatePractice(ctx, services, wizard.data.topic);
  });
}

/**
 * The single safety gate for the whole Study Assistant: while the student
 * has a live exam window open, the AI must not engage at all — we can't
 * reliably tell "explain electricity in general" apart from "explain this
 * exam question" once an exam is in progress, so the conservative and
 * spec-required behavior is to decline everything until it's over.
 */
async function blockDuringActiveExam(ctx: ProggaaBotContext, services: ServiceContainer): Promise<boolean> {
  const exams = await services.examService.getExamsForStudent(ctx.auth.proggaaUserId!);
  const hasLiveExam = exams.some((e) => e.status === "LIVE");
  if (hasLiveExam) {
    await ctx.reply(
      "🚫 I can't solve or explain active exam questions while your exam is in progress. I can help you review the topic after the exam.",
      backToMenuKeyboard()
    );
    return true;
  }
  return false;
}

/** Called by the central text router when a "study" wizard is awaiting free-text input. */
export async function handleStudyTextInput(ctx: ProggaaBotContext, services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "study") return;

  const validated = validateBoundedText(text, TEXT_LIMITS.aiTopic);
  if (!validated.ok) {
    await ctx.reply(`That ${validated.error}. Please try again.`);
    return;
  }

  if (wizard.step === "awaiting_practice_topic") {
    clearWizard(ctx);
    wizard.data.topic = validated.value;
    await generatePractice(ctx, services, validated.value, wizard.data);
    return;
  }

  if (wizard.step === "awaiting_topic") {
    const mode = wizard.data.mode as TutorMode;
    clearWizard(ctx);

    if (await blockDuringActiveExam(ctx, services)) return;

    try {
      const courses = await services.courseService.getCoursesForStudent(ctx.auth.proggaaUserId!);
      const answer = await services.aiService.tutor({
        mode,
        topic: validated.value,
        enrolledCourses: courses.map((c) => c.name),
      });
      logger.audit("study.tutor_used", { telegramId: ctx.auth.telegramId, mode });
      await ctx.reply(answer, { parse_mode: "Markdown", ...backToMenuKeyboard() });
    } catch (error) {
      logger.error("study.tutor_failed", { error: String(error) });
      await ctx.reply("😕 Something went wrong generating that. Please try again.");
    }
    return;
  }

  // "practicing" (or any other leftover step): nothing left to do with
  // free text here — use the buttons instead of clearing silently.
  clearWizard(ctx);
  await ctx.reply("Use the buttons above, or open /study to start again.");
}

async function generatePractice(
  ctx: ProggaaBotContext,
  services: ServiceContainer,
  topic: string,
  wizardData?: Record<string, string>
) {
  try {
    const result = await services.aiService.generateMCQ({ topic, difficulty: "MEDIUM", count: 5 });
    // Keep the wizard alive (re-armed below) only so "More practice" can
    // reuse the same topic without re-asking for it.
    startWizard(ctx, "study", "practicing", { topic, ...wizardData });

    const preview = result.questions
      .map((q, i) => `${i + 1}. ${q.prompt}${q.choices ? "\n   " + q.choices.join(" · ") : ""}`)
      .join("\n\n");

    await ctx.reply(`📝 *Practice — ${topic}*\n\n${preview}`, {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🔁 More practice", "study:practice:more")],
        [Markup.button.callback("⬅️ Back to Menu", "menu:home")],
      ]),
    });
  } catch (error) {
    logger.error("study.practice_failed", { error: String(error) });
    await ctx.reply("😕 Couldn't generate practice questions right now. Please try again.");
  }
}

async function sendStudyMenu(ctx: ProggaaBotContext, services: ServiceContainer) {
  if (await blockDuringActiveExam(ctx, services)) return;

  const rows = (Object.entries(MODE_LABELS) as [TutorMode, string][]).map(([mode, label]) => [
    Markup.button.callback(label, `study:mode:${mode}`),
  ]);
  rows.push([Markup.button.callback("📝 Generate Practice Questions", "study:practice")]);
  rows.push([Markup.button.callback("⬅️ Back to Menu", "menu:home")]);

  await ctx.reply("🧠 *Study Assistant*\n\nWhat would you like help with?", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

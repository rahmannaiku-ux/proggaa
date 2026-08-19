import { Markup } from "telegraf";
import type { Telegraf } from "telegraf";
import type { AIGenerationResult, QuestionDifficulty, QuestionType } from "../../types/domain";
import type { ProggaaBotContext } from "../../types/session";
import type { ServiceContainer } from "../../services/container";
import { requireRole } from "../middleware/guards";
import { startWizard, clearWizard } from "../handlers/wizard";
import { backToMenuKeyboard } from "../keyboards/mainMenu";
import { validateBoundedText, TEXT_LIMITS } from "../../utils/validation";
import { logger } from "../../utils/logger";

type AIFlow = "MCQ" | "NUMERICAL" | "LESSON" | "TEXT" | "PDF";

const FLOW_LABELS: Record<AIFlow, string> = {
  MCQ: "📝 Generate MCQs",
  NUMERICAL: "🔢 Generate Numerical",
  LESSON: "📚 Generate From Lesson",
  PDF: "📄 Generate From PDF",
  TEXT: "✍️ Generate From Text",
};

const COUNT_OPTIONS = [5, 10, 15, 20];

/** Holds the last generated (unsaved) preview per chat, keyed by chat id. */
const pendingPreviews = new Map<number, AIGenerationResult>();

export function registerAICommand(bot: Telegraf<ProggaaBotContext>, services: ServiceContainer) {
  bot.command("ai", async (ctx) => {
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    await sendAIMenu(ctx);
  });

  bot.action(/^ai:flow:(MCQ|NUMERICAL|LESSON|PDF|TEXT)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    const flow = ctx.match[1] as AIFlow;

    if (flow === "MCQ" || flow === "NUMERICAL" || flow === "LESSON") {
      startWizard(ctx, "ai", "awaiting_topic", { flow });
      await ctx.reply("✍️ Send the topic (e.g. *Electricity — Chapter 5*).", { parse_mode: "Markdown" });
    } else if (flow === "TEXT") {
      startWizard(ctx, "ai", "awaiting_source_text", { flow });
      await ctx.reply("✍️ Paste the source text to generate questions from.");
    } else {
      startWizard(ctx, "ai", "awaiting_file_ref", { flow });
      await ctx.reply(
        "📄 Send the PDF as a file, or just type a short filename/reference if you don't have one handy (e.g. `chapter5.pdf`).\n\nNote: content extraction isn't implemented yet — only the filename/reference is captured for now.",
        { parse_mode: "Markdown" }
      );
    }
  });

  // Real file capture for the PDF flow — Telegram delivers uploaded files
  // as a separate "document" update, not a "text" one, so this needs its
  // own handler alongside the text router. We still don't parse PDF
  // content (that's real-AI-integration work, out of scope for the mock
  // architecture), but the actual upload is now captured for real rather
  // than only accepting a typed placeholder.
  bot.on("document", async (ctx) => {
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "ai" || wizard.step !== "awaiting_file_ref") return;

    const doc = ctx.message.document;
    const fileRef = doc.file_name ?? doc.file_id;
    wizard.data.fileRef = fileRef;
    wizard.step = "awaiting_question_type";

    await ctx.reply(`📄 Got it — using *${fileRef}*.`, { parse_mode: "Markdown" });
    await sendQuestionTypePrompt(ctx);
  });

  bot.action(/^ai:difficulty:(EASY|MEDIUM|HARD)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "ai") return;
    wizard.data.difficulty = ctx.match[1];
    wizard.step = "awaiting_count";
    await sendCountPrompt(ctx);
  });

  bot.action(/^ai:qtype:(MCQ|NUMERICAL|SHORT_ANSWER)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "ai") return;
    wizard.data.questionType = ctx.match[1];
    wizard.step = "awaiting_count";
    await sendCountPrompt(ctx);
  });

  bot.action(/^ai:count:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const wizard = ctx.session.wizard;
    if (!wizard || wizard.name !== "ai") return;
    wizard.data.count = ctx.match[1];
    await generateAndPreview(ctx, services);
  });

  bot.action("ai:regenerate", async (ctx) => {
    await ctx.answerCbQuery("Regenerating...");
    await generateAndPreview(ctx, services);
  });

  bot.action(/^ai:save:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (await requireRole(ctx, ["TEACHER", "ADMIN"])) return;
    const requestId = ctx.match[1];
    const preview = pendingPreviews.get(ctx.chat!.id);

    if (!preview || preview.requestId !== requestId) {
      await ctx.reply("This preview has expired. Please run /ai again.");
      return;
    }

    for (const question of preview.questions) {
      await services.questionBankService.createQuestion({
        type: question.type,
        difficulty: question.difficulty,
        topic: question.topic,
        prompt: question.prompt,
        choices: question.choices,
        correctAnswer: question.correctAnswer,
      });
    }

    logger.audit("ai.questions_saved_to_bank", {
      telegramId: ctx.auth.telegramId,
      count: preview.questions.length,
      requestId,
    });

    pendingPreviews.delete(ctx.chat!.id);
    clearWizard(ctx);
    await ctx.reply(
      `✅ Saved ${preview.questions.length} question${preview.questions.length === 1 ? "" : "s"} to the Question Bank.`,
      backToMenuKeyboard()
    );
  });

  bot.action("ai:discard", async (ctx) => {
    await ctx.answerCbQuery("Discarded");
    pendingPreviews.delete(ctx.chat!.id);
    clearWizard(ctx);
    await ctx.reply("Discarded. Run /ai to start again.", backToMenuKeyboard());
  });
}

/** Called by the central text router when an "ai" wizard is awaiting free-text input. */
export async function handleAITextInput(ctx: ProggaaBotContext, _services: ServiceContainer, text: string) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "ai") return;

  if (wizard.step === "awaiting_topic") {
    const validated = validateBoundedText(text, TEXT_LIMITS.aiTopic);
    if (!validated.ok) return ctx.reply(`Topic ${validated.error}. Please try again.`);
    wizard.data.topic = validated.value;
    wizard.step = "awaiting_difficulty";
    await sendDifficultyPrompt(ctx);
    return;
  }

  if (wizard.step === "awaiting_source_text") {
    const validated = validateBoundedText(text, TEXT_LIMITS.aiSourceText);
    if (!validated.ok) return ctx.reply(`Source text ${validated.error}. Please try again.`);
    wizard.data.sourceText = validated.value;
    wizard.step = "awaiting_question_type";
    await sendQuestionTypePrompt(ctx);
    return;
  }

  if (wizard.step === "awaiting_file_ref") {
    const validated = validateBoundedText(text, TEXT_LIMITS.aiFileRef);
    if (!validated.ok) return ctx.reply(`File reference ${validated.error}. Please try again.`);
    wizard.data.fileRef = validated.value;
    wizard.step = "awaiting_question_type";
    await sendQuestionTypePrompt(ctx);
    return;
  }
}

async function sendAIMenu(ctx: ProggaaBotContext) {
  const rows = (Object.entries(FLOW_LABELS) as [AIFlow, string][]).map(([flow, label]) => [
    Markup.button.callback(label, `ai:flow:${flow}`),
  ]);
  await ctx.reply("🤖 *Proggaa AI*\n\nGenerate exam questions. Nothing is saved until you approve it.", {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard(rows),
  });
}

async function sendDifficultyPrompt(ctx: ProggaaBotContext) {
  await ctx.reply(
    "🎯 Difficulty?",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("Easy", "ai:difficulty:EASY"),
        Markup.button.callback("Medium", "ai:difficulty:MEDIUM"),
        Markup.button.callback("Hard", "ai:difficulty:HARD"),
      ],
    ])
  );
}

async function sendQuestionTypePrompt(ctx: ProggaaBotContext) {
  await ctx.reply(
    "❓ Question type?",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("MCQ", "ai:qtype:MCQ"),
        Markup.button.callback("Numerical", "ai:qtype:NUMERICAL"),
        Markup.button.callback("Short answer", "ai:qtype:SHORT_ANSWER"),
      ],
    ])
  );
}

async function sendCountPrompt(ctx: ProggaaBotContext) {
  await ctx.reply(
    "🔢 How many questions?",
    Markup.inlineKeyboard([COUNT_OPTIONS.map((n) => Markup.button.callback(String(n), `ai:count:${n}`))])
  );
}

async function generateAndPreview(ctx: ProggaaBotContext, services: ServiceContainer) {
  const wizard = ctx.session.wizard;
  if (!wizard || wizard.name !== "ai") return;

  const flow = wizard.data.flow as AIFlow;
  const count = Number(wizard.data.count ?? 5);

  let result: AIGenerationResult;

  try {
    if (flow === "MCQ") {
      result = await services.aiService.generateMCQ({
        topic: wizard.data.topic,
        difficulty: (wizard.data.difficulty as QuestionDifficulty) ?? "MEDIUM",
        count,
      });
    } else if (flow === "NUMERICAL") {
      result = await services.aiService.generateNumerical({
        topic: wizard.data.topic,
        difficulty: (wizard.data.difficulty as QuestionDifficulty) ?? "MEDIUM",
        count,
      });
    } else if (flow === "LESSON") {
      // "Generate From Lesson" isn't one of the named service methods —
      // mocked as a mixed-type set covering the lesson topic.
      result = await services.aiService.generateMixedExam({
        topic: wizard.data.topic,
        difficulty: (wizard.data.difficulty as QuestionDifficulty) ?? "MEDIUM",
        count,
      });
    } else if (flow === "TEXT") {
      result = await services.aiService.generateFromText(
        wizard.data.sourceText,
        (wizard.data.questionType as QuestionType) ?? "MCQ",
        count
      );
    } else {
      result = await services.aiService.generateFromPDF(
        wizard.data.fileRef,
        (wizard.data.questionType as QuestionType) ?? "MCQ",
        count
      );
    }
  } catch (error) {
    logger.error("ai.generation_failed", { error: String(error) });
    await ctx.reply("😕 Generation failed. Please try again.");
    return;
  }

  pendingPreviews.set(ctx.chat!.id, result);
  wizard.step = "previewing";
  wizard.data.requestId = result.requestId;

  const preview = result.questions
    .slice(0, 10)
    .map((q, i) => `${i + 1}. ${q.prompt}${q.choices ? "\n   " + q.choices.join(" · ") : ""}`)
    .join("\n\n");
  const more = result.questions.length > 10 ? `\n\n…and ${result.questions.length - 10} more.` : "";

  await ctx.reply(`👀 *Preview* (${result.questions.length} questions)\n\n${preview}${more}`, {
    parse_mode: "Markdown",
    ...Markup.inlineKeyboard([
      [Markup.button.callback("✅ Save to Question Bank", `ai:save:${result.requestId}`)],
      [
        Markup.button.callback("🔁 Regenerate", "ai:regenerate"),
        Markup.button.callback("❌ Discard", "ai:discard"),
      ],
    ]),
  });
}

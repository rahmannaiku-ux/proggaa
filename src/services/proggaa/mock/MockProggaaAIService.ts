import type {
  AIGenerationRequest,
  AIGenerationResult,
  Question,
  QuestionType,
  TutorRequest,
} from "../../../types/domain";
import type { ProggaaAIService } from "../interfaces";

let requestCounter = 0;
let questionCounter = 0;

function fakeQuestion(type: QuestionType, topic: string, difficulty: AIGenerationRequest["difficulty"]): Question {
  questionCounter += 1;
  const id = `mock_q_${questionCounter}`;
  if (type === "MCQ") {
    return {
      id,
      type,
      difficulty,
      topic,
      prompt: `[Mock MCQ] Sample question about "${topic}" (${difficulty.toLowerCase()}).`,
      choices: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option A",
    };
  }
  if (type === "NUMERICAL") {
    return {
      id,
      type,
      difficulty,
      topic,
      prompt: `[Mock numerical] Sample calculation question about "${topic}".`,
      correctAnswer: "42",
    };
  }
  return {
    id,
    type,
    difficulty,
    topic,
    prompt: `[Mock short answer] Explain a key idea in "${topic}".`,
  };
}

/**
 * Placeholder AI provider. Does NOT call any real AI model — it exists so
 * the Telegram UX (generate → preview → edit/regenerate → save) can be
 * fully built and tested today. Swap for a real provider (e.g. backed by
 * Gemini/OpenAI through the Proggaa API) without touching bot code.
 */
export class MockProggaaAIService implements ProggaaAIService {
  private async generate(
    request: Omit<AIGenerationRequest, "questionType">,
    type: QuestionType
  ): Promise<AIGenerationResult> {
    requestCounter += 1;
    const count = Math.max(1, Math.min(request.count, 20));
    const questions = Array.from({ length: count }, () =>
      fakeQuestion(type, request.topic, request.difficulty)
    );
    return { requestId: `mock_req_${requestCounter}`, questions };
  }

  async generateMCQ(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult> {
    return this.generate(request, "MCQ");
  }

  async generateNumerical(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult> {
    return this.generate(request, "NUMERICAL");
  }

  async generateShortAnswer(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult> {
    return this.generate(request, "SHORT_ANSWER");
  }

  async generateMixedExam(request: Omit<AIGenerationRequest, "questionType">): Promise<AIGenerationResult> {
    requestCounter += 1;
    const count = Math.max(1, Math.min(request.count, 20));
    const types: QuestionType[] = ["MCQ", "NUMERICAL", "SHORT_ANSWER"];
    const questions = Array.from({ length: count }, (_, i) =>
      fakeQuestion(types[i % types.length], request.topic, request.difficulty)
    );
    return { requestId: `mock_req_${requestCounter}`, questions };
  }

  async generateFromText(sourceText: string, questionType: QuestionType, count: number): Promise<AIGenerationResult> {
    requestCounter += 1;
    const topic = sourceText.slice(0, 40) || "provided text";
    const questions = Array.from({ length: Math.max(1, Math.min(count, 20)) }, () =>
      fakeQuestion(questionType, topic, "MEDIUM")
    );
    return { requestId: `mock_req_${requestCounter}`, questions };
  }

  async generateFromPDF(fileRef: string, questionType: QuestionType, count: number): Promise<AIGenerationResult> {
    requestCounter += 1;
    const questions = Array.from({ length: Math.max(1, Math.min(count, 20)) }, () =>
      fakeQuestion(questionType, `PDF (${fileRef})`, "MEDIUM")
    );
    return { requestId: `mock_req_${requestCounter}`, questions };
  }

  async tutor(request: TutorRequest): Promise<string> {
    const { mode, topic } = request;
    if (mode === "EXPLAIN_TOPIC") {
      return [
        `📘 *${topic}*`,
        "",
        `[Mock explanation] Here's the core idea behind "${topic}": start with the definition, then the one or two rules that matter most, then a worked example. Ask a follow-up if any part is unclear.`,
      ].join("\n");
    }
    if (mode === "SUMMARIZE_LESSON") {
      const matchedCourse = request.enrolledCourses?.find(
        (name) => topic.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(topic.toLowerCase())
      );
      const courseNote = matchedCourse ? ` (from your course "${matchedCourse}")` : "";
      return `📝 [Mock summary] The lesson "${topic}"${courseNote} boils down to a few key takeaways — the core definition, the main formula or process, and one common mistake to avoid.`;
    }
    if (mode === "HINT") {
      return `💡 [Mock hint] For "${topic}", think about what's given vs. what's being asked, and which rule connects them — try that first before checking the full explanation.`;
    }
    if (mode === "FLASHCARDS") {
      return [
        `🗂️ *Flashcards — ${topic}*`,
        "",
        `1) Q: What is ${topic}?  A: [Mock] core definition.`,
        `2) Q: Give one example of ${topic}.  A: [Mock] worked example.`,
        `3) Q: Common mistake with ${topic}?  A: [Mock] the usual pitfall.`,
      ].join("\n");
    }
    // REVISION_SESSION
    return [
      `📅 *Revision Session — ${topic}*`,
      "",
      "1. Re-read the core definitions (10 min)",
      "2. Work through 5 practice questions",
      "3. Review anything you got wrong",
      "4. One more pass on the weakest part",
    ].join("\n");
  }
}

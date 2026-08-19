import type { Question, QuestionDifficulty, QuestionType } from "../../../types/domain";
import type { QuestionBankService } from "../interfaces";
import { NotFoundError } from "../errors";

let idCounter = 100;
const questions: Question[] = [
  {
    id: "qb_1",
    type: "MCQ",
    difficulty: "EASY",
    topic: "Electricity",
    prompt: "What is the SI unit of electric current?",
    choices: ["Volt", "Ampere", "Ohm", "Watt"],
    correctAnswer: "Ampere",
  },
];

export class MockQuestionBankService implements QuestionBankService {
  async searchQuestions(query: {
    topic?: string;
    type?: QuestionType;
    difficulty?: QuestionDifficulty;
  }): Promise<Question[]> {
    return questions.filter(
      (q) =>
        (!query.topic || q.topic.toLowerCase().includes(query.topic.toLowerCase())) &&
        (!query.type || q.type === query.type) &&
        (!query.difficulty || q.difficulty === query.difficulty)
    );
  }

  async getQuestion(questionId: string): Promise<Question | null> {
    return questions.find((q) => q.id === questionId) ?? null;
  }

  async addQuestionToExam(questionId: string, _examId: string): Promise<void> {
    const question = questions.find((q) => q.id === questionId);
    if (!question) throw new NotFoundError("Question");
    // Mock no-op: a real implementation would persist an exam<->question link.
  }

  async createQuestion(question: Omit<Question, "id">): Promise<Question> {
    idCounter += 1;
    const created: Question = { ...question, id: `qb_${idCounter}` };
    questions.push(created);
    return created;
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const index = questions.findIndex((q) => q.id === questionId);
    if (index === -1) throw new NotFoundError("Question");
    questions.splice(index, 1);
  }
}

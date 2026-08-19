import type { ExamSummary, LiveExamStatus } from "../../../types/domain";
import type { ProggaaExamService } from "../interfaces";
import { mockExams, mockLiveExams } from "./mockData";

export class MockProggaaExamService implements ProggaaExamService {
  async getExamsForStudent(_proggaaUserId: string): Promise<ExamSummary[]> {
    return mockExams;
  }

  async getExamsForTeacher(_proggaaUserId: string): Promise<ExamSummary[]> {
    return mockExams;
  }

  async getExamById(examId: string): Promise<ExamSummary | null> {
    return mockExams.find((e) => e.id === examId) ?? null;
  }

  async getLiveExamStatus(examId: string): Promise<LiveExamStatus | null> {
    return mockLiveExams.find((e) => e.examId === examId) ?? null;
  }

  async getLiveExamsForTeacher(_proggaaUserId: string): Promise<LiveExamStatus[]> {
    return mockLiveExams;
  }
}

import type { Course, TeacherAnalytics } from "../../../types/domain";
import type { ProggaaCourseService } from "../interfaces";
import { mockCourses, mockResults } from "./mockData";

export class MockProggaaCourseService implements ProggaaCourseService {
  async getCoursesForStudent(_proggaaUserId: string): Promise<Course[]> {
    // In the mock, every student sees the same demo courses.
    return mockCourses;
  }

  async getCoursesForTeacher(_proggaaUserId: string): Promise<Course[]> {
    return mockCourses;
  }

  async getCourseById(courseId: string): Promise<Course | null> {
    return mockCourses.find((c) => c.id === courseId) ?? null;
  }

  async getTeacherAnalytics(_proggaaUserId: string): Promise<TeacherAnalytics> {
    const avgCourseProgress = mockCourses.length
      ? Math.round(mockCourses.reduce((sum, c) => sum + c.progressPercent, 0) / mockCourses.length)
      : 0;
    const avgExamScore = mockResults.length
      ? Math.round(mockResults.reduce((sum, r) => sum + r.percentage, 0) / mockResults.length)
      : 0;

    return {
      totalStudents: 82, // matches the demo live-exam roster size used elsewhere
      avgCourseProgress,
      avgExamScore,
      completionRate: 71,
    };
  }
}

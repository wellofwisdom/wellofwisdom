// SPDX-License-Identifier: AGPL-3.0-or-later
export interface Me {
  id: number;
  role: "parent" | "learner";
  name: string;
  familyId: number;
  familyName: string;
  joinCode: string;
  prefs: Record<string, unknown>;
  gradeLevel: number | null;
  interests: string[];
}

export interface Learner {
  id: number;
  name: string;
  username: string;
  grade_level: number | null;
  interests: string[];
  reading_level: string | null;
  ai_notes: string | null;
  email: string | null;
  created_at: string;
}

export interface MeResponse {
  user: Me | null;
  learners?: Learner[];
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  db: { configured: boolean; ok?: boolean; error?: string };
  ai: { configured: boolean };
}

// ---- courses (parent) ----

export interface CourseSummary {
  id: number;
  title: string;
  topic: string;
  lens: string | null;
  grade_level: number | null;
  status: "draft" | "published" | "archived";
  description: string | null;
  learner_name: string | null;
  unit_count: number;
  lesson_count: number;
  exercise_count: number;
  created_at: string;
}

export interface ItemNode {
  id: number;
  type: "article" | "exercise" | "video" | "project";
  position: number;
  content: Record<string, any>;
}

export interface CourseTree {
  id: number;
  title: string;
  topic: string;
  lens: string | null;
  grade_level: number | null;
  status: "draft" | "published" | "archived";
  description: string | null;
  learner_id: number | null;
  learner_name: string | null;
  public_slug: string | null;
  published_at: string | null;
  units: {
    id: number;
    title: string;
    lessons: {
      id: number;
      title: string;
      summary: string | null;
      items: ItemNode[];
    }[];
  }[];
}

export interface Job {
  id: number;
  type: string;
  status: "queued" | "running" | "done" | "error";
  error: string | null;
  result: { courseId?: number; title?: string } | null;
}

// ---- learn (learner) ----

export interface LearnCourse {
  id: number;
  title: string;
  topic: string;
  lens: string | null;
  description: string | null;
  lesson_count: number;
}

export interface LearnCourseTree {
  id: number;
  title: string;
  description: string | null;
  progress: { lessonsDone: number; lessonsTotal: number };
  units: {
    id: number;
    title: string;
    lessons: { id: number; title: string; summary: string | null; done: boolean }[];
  }[];
}

export interface LearnLesson {
  id: number;
  course_id: number;
  course_title: string;
  title: string;
  summary: string | null;
  items: ItemNode[];
}

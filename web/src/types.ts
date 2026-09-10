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
  tutor_mode: "hints" | "guided" | "full";
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
  trailer_upload_id: number | null;
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

// A learner's own view of work they handed in. Feedback is null until a guide
// has written it and sent it back: the AI's draft never appears here.
export interface Submission {
  item_id: number;
  body: string;
  status: "draft" | "submitted" | "returned";
  submitted_at: string | null;
  feedback: string | null;
  outcome: string | null;
  returned_at: string | null;
}

export interface Outcome {
  id: string;
  label: string;
  blurb: string;
}

// The guide's view: everything above plus the brief it was written against and
// the AI's draft, which only ever reaches this side.
export interface WorkItem {
  id: number;
  learner_id: number;
  learner_name: string;
  grade_level: number | null;
  item_id: number;
  lesson_id: number;
  lesson_title: string;
  course_id: number;
  course_title: string;
  project: { title: string | null; description: string | null; rubric: string | null };
  body: string;
  words: number;
  status: "submitted" | "returned";
  submitted_at: string | null;
  feedback: string | null;
  outcome: string | null;
  returned_at: string | null;
  ai_feedback: RubricDraft | null;
  ai_at: string | null;
  updated_at: string;
}

export interface RubricDraft {
  criteria: { criterion: string; verdict: string | null; note: string }[];
  strengths: string[];
  improve: string[];
  toLearner: string;
  forGuide: string;
  suggestedOutcome: string | null;
  note?: string;
  words?: number;
}

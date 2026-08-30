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

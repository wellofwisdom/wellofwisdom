// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../api", () => ({
  api: vi.fn(() => new Promise(() => {})),
  niceError: (e: unknown) => String(e),
  getPreviewLearner: () => null,
  setPreviewLearner: vi.fn(),
  ApiError: class ApiError extends Error {
    code = "mock";
    status = 500;
  },
}));

const noop = () => {};
const me = { id: 10, role: "learner" as const, name: "Maya", familyId: 1, familyName: "Test", joinCode: "ABC", prefs: {}, gradeLevel: 5, interests: [] };

import LearnerApp from "./LearnerApp";
import CourseView from "./CourseView";
import LessonPlayer from "./LessonPlayer";
import Practice from "./Practice";
import WorldView from "./WorldView";
import DailiesBoard from "./DailiesBoard";
import WeekliesBoard from "./WeekliesBoard";
import QuestLog from "./QuestLog";
import LearnerShell from "./LearnerShell";
import CoursePath from "./CoursePath";

describe("learn pages smoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("LearnerApp renders", () => {
    const { container } = render(<LearnerApp me={me} route="" onNavigate={noop} onLogout={noop} />);
    expect(container).toBeTruthy();
  });

  it("CourseView renders", () => {
    const { container } = render(<CourseView courseId={1} onNavigate={noop} onLogout={noop} />);
    expect(container).toBeTruthy();
  });

  it("LessonPlayer renders", () => {
    const { container } = render(<LessonPlayer lessonId={1} onNavigate={noop} onLogout={noop} />);
    expect(container).toBeTruthy();
  });

  it("Practice renders", () => {
    const { container } = render(<Practice onNavigate={noop} onLogout={noop} />);
    expect(container).toBeTruthy();
  });

  it("WorldView renders", () => {
    const { container } = render(<WorldView adventureId={1} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("DailiesBoard renders", () => {
    const { container } = render(<DailiesBoard reviewsDue={0} upcomingCount={0} streakActive={false} />);
    expect(container).toBeTruthy();
  });

  it("WeekliesBoard renders", () => {
    const { container } = render(<WeekliesBoard reviewsDue={0} lessonsDone={0} lessonsTotal={0} streakActive={false} />);
    expect(container).toBeTruthy();
  });

  it("QuestLog renders", () => {
    const { container } = render(<QuestLog upcoming={[]} returned={[]} reviewsDue={0} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("LearnerShell renders", () => {
    const { container } = render(
      <LearnerShell me={me} onNavigate={noop} onLogout={noop}>
        <div>child</div>
      </LearnerShell>
    );
    expect(container.textContent).toContain("child");
  });

  it("CoursePath renders", () => {
    const course = {
      id: 1,
      title: "Test Course",
      description: null,
      progress: { lessonsDone: 0, lessonsTotal: 2 },
      units: [
        { id: 1, title: "Unit 1", lessons: [{ id: 1, title: "Lesson 1", summary: null, done: false }, { id: 2, title: "Lesson 2", summary: null, done: false }] },
      ],
    };
    const { container } = render(<CoursePath course={course} onNavigate={noop} />);
    expect(container.textContent).toContain("Lesson 1");
  });
});

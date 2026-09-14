// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Mock the api module: every page imports { api } from "../api" or "../../api"
vi.mock("../api", () => ({
  api: vi.fn(() => new Promise(() => {})),
  niceError: (e: unknown) => String(e),
  getPreviewLearner: () => null,
  setPreviewLearner: vi.fn(),
  ApiError: class ApiError extends Error {
    code = "mock";
    status = 500;
  },
}));

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
const me = {
  user: { id: 1, role: "parent" as const, name: "Test Guide", familyId: 1, familyName: "Test Family", joinCode: "ABC123", prefs: {}, gradeLevel: null, interests: [] },
  learners: [{ id: 1, name: "Maya", username: "maya", grade_level: 5, interests: [], reading_level: null, ai_notes: null, email: null, tutor_mode: "hints" as const, created_at: new Date().toISOString() }],
};

// Import all pages after mocks are set up
import Landing from "./Landing";
import Dashboard from "./Dashboard";
import Learners from "./Learners";
import LearnerForm from "./LearnerForm";
import Courses from "./Courses";
import CourseDetail from "./CourseDetail";
import Progress from "./Progress";
import Plans from "./Plans";
import Notes from "./Notes";
import Community from "./Community";
import Library from "./Library";
import Calendar from "./Calendar";
import ReportView from "./ReportView";
import PlanWizard from "./PlanWizard";
import PlanDetail from "./PlanDetail";
import Settings from "./Settings";
import Studio from "./Studio";
import Experience from "./Experience";
import TutorLog from "./TutorLog";
import Work from "./Work";
import Attendance from "./Attendance";
import Portfolio from "./Portfolio";
import Join from "./Join";
import NotFound from "./NotFound";
import PrintLesson from "./PrintLesson";
import { PublicGallery, PublicCourse } from "./PublicCourse";

describe("pages smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Landing renders", () => {
    const { container } = render(<Landing onAuthed={noop} />);
    expect(container.textContent).toBeTruthy();
  });

  it("Dashboard renders", () => {
    const { container } = render(<Dashboard me={me} onNavigate={noop} />);
    expect(container.textContent).toBeTruthy();
  });

  it("Learners renders", () => {
    const { container } = render(<Learners me={me} />);
    expect(container).toBeTruthy();
  });

  it("LearnerForm renders for new", () => {
    const { container } = render(<LearnerForm learnerId={null} onSaved={noop} />);
    expect(container).toBeTruthy();
  });

  it("Courses renders", () => {
    const { container } = render(<Courses onNavigate={noop} />);
    expect(container.textContent).toBeTruthy();
  });

  it("CourseDetail renders", () => {
    const { container } = render(<CourseDetail me={me} courseId={1} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("Progress renders", () => {
    const { container } = render(<Progress />);
    expect(container).toBeTruthy();
  });

  it("Plans renders", () => {
    const { container } = render(<Plans onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("Notes renders", () => {
    const { container } = render(<Notes />);
    expect(container).toBeTruthy();
  });

  it("Community renders", () => {
    const { container } = render(<Community onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("Library renders", () => {
    const { container } = render(<Library />);
    expect(container).toBeTruthy();
  });

  it("Calendar renders", () => {
    const { container } = render(<Calendar onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("ReportView renders", () => {
    const { container } = render(<ReportView reportId={1} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("PlanWizard renders", () => {
    const { container } = render(<PlanWizard me={me} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("PlanDetail renders", () => {
    const { container } = render(<PlanDetail planId={1} onNavigate={noop} meLearners={[]} />);
    expect(container).toBeTruthy();
  });

  it("Settings renders", () => {
    const { container } = render(<Settings me={me} />);
    expect(container).toBeTruthy();
  });

  it("Studio renders", () => {
    const { container } = render(<Studio me={me} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("Experience renders", () => {
    const { container } = render(<Experience />);
    expect(container).toBeTruthy();
  });

  it("TutorLog renders", () => {
    const { container } = render(<TutorLog me={me} />);
    expect(container).toBeTruthy();
  });

  it("Work renders", () => {
    const { container } = render(<Work />);
    expect(container).toBeTruthy();
  });

  it("Attendance renders", () => {
    const { container } = render(<Attendance />);
    expect(container).toBeTruthy();
  });

  it("Portfolio renders", () => {
    const { container } = render(<Portfolio learnerId={1} onNavigate={noop} />);
    expect(container).toBeTruthy();
  });

  it("Join renders", () => {
    const { container } = render(<Join token="test-token" />);
    expect(container).toBeTruthy();
  });

  it("NotFound renders", () => {
    const { container } = render(<NotFound path="nope" />);
    expect(container.textContent).toContain("That page does not exist");
  });

  it("PrintLesson renders", () => {
    const { container } = render(<PrintLesson lessonId={1} role="parent" />);
    expect(container).toBeTruthy();
  });

  it("PublicGallery renders", () => {
    const { container } = render(<PublicGallery />);
    expect(container).toBeTruthy();
  });

  it("PublicCourse renders", () => {
    const { container } = render(<PublicCourse slug="test-course" />);
    expect(container).toBeTruthy();
  });
});

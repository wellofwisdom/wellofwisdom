// SPDX-License-Identifier: AGPL-3.0-or-later
// Coverage for the central title map and both 404 flavors, in the
// pages.smoke.test.tsx style: mock the api module, render, assert.
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

// jsdom has no matchMedia; the Shell's dark-mode sync listens on it.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

// Controllable api mock: pending by default (so smoke-style renders never
// resolve anything), with per-test implementations for the App-level tests.
const { apiMock } = vi.hoisted(() => ({
  apiMock: vi.fn((_path: string, _opts?: { method?: string; body?: unknown }) => new Promise(() => {})),
}));
vi.mock("./api", () => ({
  api: (path: string, opts?: { method?: string; body?: unknown }) => apiMock(path, opts),
  niceError: (e: unknown) => String(e),
  getPreviewLearner: () => null,
  setPreviewLearner: vi.fn(),
  ApiError: class ApiError extends Error {
    code = "mock";
    status = 500;
  },
}));

import { titleFor } from "./titles";
import App from "./App";
import NotFound, { PublicNotFound } from "./pages/NotFound";

const BRAND = "Well of Wisdom";

const guideMe = {
  user: { id: 1, role: "parent" as const, name: "Test Guide", familyId: 1, familyName: "Test Family", joinCode: "ABC123", prefs: {}, gradeLevel: null, interests: [] },
  learners: [
    { id: 7, name: "Maya", username: "maya", grade_level: 5, interests: [], reading_level: null, ai_notes: null, email: null, tutor_mode: "hints" as const, created_at: new Date().toISOString() },
  ],
};

const learnerMe = {
  user: { id: 2, role: "learner" as const, name: "Maya", familyId: 1, familyName: "Test Family", joinCode: "ABC123", prefs: {}, gradeLevel: 5, interests: [] },
};

function atPath(path: string) {
  window.history.pushState({}, "", path);
}

describe("titleFor", () => {
  it("titles guide console routes specifically", () => {
    expect(titleFor({ route: "learners", session: "guide" })).toBe(`Learners · ${BRAND}`);
    expect(titleFor({ route: "courses", session: "guide" })).toBe(`Courses · ${BRAND}`);
    expect(titleFor({ route: "attendance", session: "guide" })).toBe(`Attendance and Assessments · ${BRAND}`);
    expect(titleFor({ route: "plans/new", session: "guide" })).toBe(`Plan Assistant · ${BRAND}`);
  });

  it("detail pages fall back to generic plus id", () => {
    expect(titleFor({ route: "course/12", session: "guide" })).toBe(`Course 12 · ${BRAND}`);
    expect(titleFor({ route: "plan/3", session: "guide" })).toBe(`Learning path 3 · ${BRAND}`);
    expect(titleFor({ route: "report/5", session: "guide" })).toBe(`Progress report 5 · ${BRAND}`);
    expect(titleFor({ route: "learners/9", session: "guide" })).toBe(`Edit learner 9 · ${BRAND}`);
    expect(titleFor({ route: "portfolio/9", session: "guide" })).toBe(`Portfolio 9 · ${BRAND}`);
  });

  it("uses names App already holds, without fetching for a title", () => {
    expect(titleFor({ route: "course/12", session: "guide", courseTitle: (id) => (id === 12 ? "Fractions through Sewing" : undefined) })).toBe(
      `Fractions through Sewing · ${BRAND}`
    );
    expect(titleFor({ route: "learners/7", session: "guide", learnerName: (id) => (id === 7 ? "Maya" : undefined) })).toBe(`Maya · ${BRAND}`);
    expect(titleFor({ route: "portfolio/7", session: "guide", learnerName: (id) => (id === 7 ? "Maya" : undefined) })).toBe(`Portfolio: Maya · ${BRAND}`);
  });

  it("titles learner routes", () => {
    expect(titleFor({ route: "dashboard", session: "learner" })).toBe(`Home · ${BRAND}`);
    expect(titleFor({ route: "practice", session: "learner" })).toBe(`Practice · ${BRAND}`);
    expect(titleFor({ route: "course/4", session: "learner" })).toBe(`Course 4 · ${BRAND}`);
    expect(titleFor({ route: "world/2", session: "learner" })).toBe(`World 2 · ${BRAND}`);
    expect(titleFor({ route: "lesson/8", session: "learner" })).toBe(`Lesson · ${BRAND}`);
  });

  it("public routes answer with the site.json titles the server also sends", () => {
    expect(titleFor({ route: "features", session: "public" })).toBe("Every feature in Well of Wisdom");
    expect(titleFor({ route: "privacy", session: "public" })).toBe("Privacy policy: Well of Wisdom");
    expect(titleFor({ route: "for-tutors", session: "guide" })).toBe("Well of Wisdom for tutors and learning centers");
    expect(titleFor({ route: "c", session: "public" })).toBe("Open courses from Well of Wisdom");
    expect(titleFor({ route: "dashboard", session: "public" })).toBe("Well of Wisdom: open-source AI learning for every kind of teacher");
  });

  it("never downgrades a server-titled public course page", () => {
    expect(titleFor({ route: "c/fractions-through-sewing", session: "public" })).toBeNull();
  });

  it("titles unknown routes as not found in both shells", () => {
    expect(titleFor({ route: "no-such-page", session: "public" })).toBe(`Page not found · ${BRAND}`);
    expect(titleFor({ route: "no-such-page", session: "guide" })).toBe(`Page not found · ${BRAND}`);
    expect(titleFor({ route: "no-such-page", session: "learner" })).toBe(`Home · ${BRAND}`);
  });
});

describe("the two 404 flavors", () => {
  it("the signed-in NotFound keeps its job", () => {
    const { container } = render(<NotFound path="nope" />);
    expect(container.textContent).toContain("That page does not exist");
    expect(container.textContent).toContain("Back to the dashboard");
  });

  it("the logged-out flavor gets site chrome, a clear line, and way-out links", () => {
    const { container } = render(<PublicNotFound path="nope" />);
    expect(container.textContent).toContain("We could not find that page");
    expect(container.querySelector("header.s-header")).toBeTruthy();
    expect(container.querySelector("footer.s-footer")).toBeTruthy();
    const hrefs = Array.from(container.querySelectorAll("main a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/c");
  });
});

describe("App applies titles by session", () => {
  beforeEach(() => {
    apiMock.mockReset();
    document.title = "";
    atPath("/");
  });

  it("a logged-out visitor on a bogus path gets the public 404, chrome and title", async () => {
    atPath("/no-such-page");
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve({ user: null });
      return Promise.resolve({ enabled: false });
    });
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain("We could not find that page"));
    expect(container.querySelector("header.s-header")).toBeTruthy();
    expect(container.querySelector("footer.s-footer")).toBeTruthy();
    await waitFor(() => expect(document.title).toBe(`Page not found · ${BRAND}`));
  });

  it("the logged-out root stays the landing page with the site home title", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve({ user: null });
      if (path === "/api/auth/config") return Promise.resolve({ inviteRequired: false });
      return Promise.resolve({ enabled: false, courses: [] });
    });
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain("Every learner drinks from"));
    await waitFor(() => expect(document.title).toBe("Well of Wisdom: open-source AI learning for every kind of teacher"));
  });

  it("a signed-in guide on a bogus path keeps the console NotFound, titled as not found", async () => {
    atPath("/also-missing");
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(guideMe);
      if (path === "/api/courses") return Promise.resolve({ courses: [] });
      return Promise.resolve({});
    });
    const { container } = render(<App />);
    await waitFor(() => expect(container.textContent).toContain("That page does not exist"));
    expect(container.textContent).not.toContain("We could not find that page");
    await waitFor(() => expect(document.title).toBe(`Page not found · ${BRAND}`));
  });

  it("a signed-in guide on a console route gets that route's title", async () => {
    atPath("/courses");
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(guideMe);
      if (path === "/api/courses") return Promise.resolve({ courses: [] });
      return Promise.resolve({});
    });
    render(<App />);
    await waitFor(() => expect(document.title).toBe(`Courses · ${BRAND}`));
  });

  it("a learner lands on Home with the learner title", async () => {
    apiMock.mockImplementation((path: string) => {
      if (path === "/api/me") return Promise.resolve(learnerMe);
      return Promise.resolve({});
    });
    render(<App />);
    await waitFor(() => expect(document.title).toBe(`Home · ${BRAND}`));
  });
});

// SPDX-License-Identifier: AGPL-3.0-or-later
// The hero's well and the three product vignettes. The vignettes are drawn
// from the real screens and filled with a real published course, How Alice
// Shares the Tarts, so nothing shown is a feature the app does not have.
import { useEffect, useState } from "react";
import { api } from "../api";
import { linkProps } from "../router";
import { SITE } from "./data";
import { LeafIcon } from "./SiteChrome";

const HAZEL_LABEL: Record<string, string> = {
  studio: "Studio", paths: "Paths", lessons: "Lessons", worlds: "Worlds", tutor: "Tutor",
  memory: "Review", records: "Records", groups: "Groups", open: "Open",
};

export function Well() {
  return (
    <div>
      <div className="s-well">
        <div className="s-well-ripples" aria-hidden="true"><span /><span /><span /></div>
        <div className="s-well-mark">
          <img src="/logo-192.png" srcSet="/logo-192.png 1x, /logo-512.png 2x" alt="The Well of Wisdom: a carved stone well with nine hazel leaves floating on the water" width={320} height={320} />
        </div>
        <nav className="s-hazels" aria-label="The nine parts of Well of Wisdom">
          {SITE.pillars.map((p, i) => (
            <a
              key={p.id}
              className="s-hazel"
              href={`/features#${p.id}`}
              style={{ ["--a" as string]: `${-90 + i * 40}deg` }}
              title={p.line}
            >
              <LeafIcon />
              <b>{p.numeral}</b>
              {HAZEL_LABEL[p.id] || p.title}
            </a>
          ))}
        </nav>
      </div>
      <p className="s-well-caption">Nine hazels over the well, one for each way of learning.</p>
    </div>
  );
}

function Frac({ n, d }: { n: number; d: number }) {
  return <span className="s-frac" aria-label={`${n} over ${d}`}><span>{n}</span><span>{d}</span></span>;
}

export function StudioShot() {
  return (
    <figure className="s-shot" aria-label="Course Studio generating a course">
      <figcaption className="s-shot-bar"><i /><i /><i /> Course Studio</figcaption>
      <div className="s-shot-body">
        <dl style={{ margin: 0 }}>
          <div className="s-field"><dt>Learners</dt><dd>Class 4B, 24 learners</dd></div>
          <div className="s-field"><dt>Topic</dt><dd>Fractions, grade 4</dd></div>
          <div className="s-field"><dt>Lens</dt><dd><span className="s-chip is-lens">Alice in Wonderland</span><span className="s-chip">baking</span><span className="s-chip">football</span></dd></div>
          <div className="s-field"><dt>Sources</dt><dd><span className="s-chip">Unit 3 notes</span><span className="s-chip">Carroll, 1865</span></dd></div>
        </dl>
        <div className="s-outline">
          <div className="s-outline-unit">Down the rabbit hole: what is a fraction?</div>
          <ul>
            <li>Pieces of the cake <small>article · 3 exercises</small></li>
            <li>Same size pieces are easy to compare <small>video · 4 exercises</small></li>
          </ul>
          <div className="s-outline-unit">The Queen's croquet: when pieces do not match</div>
          <ul>
            <li>Making pieces match: equivalent fractions <small>project</small></li>
          </ul>
        </div>
        <div className="s-status"><CheckDot /> Ready for your review. Nothing reaches a learner until you publish.</div>
      </div>
    </figure>
  );
}

function CheckDot() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity=".18" />
      <path d="M5.5 10.5 8.5 13.5 14.5 7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WorldShot() {
  const nodes: [number, number, string, string][] = [
    [8, 78, "is-done", "1"], [24, 40, "is-done", "2"], [42, 70, "is-done", "3"],
    [58, 30, "is-next", "4"], [74, 62, "", "5"], [92, 28, "is-boss", "Q"],
  ];
  return (
    <figure className="s-shot s-game" aria-label="A learner's world map with a question">
      <div className="s-hud">
        <span>Maya</span>
        <span className="s-grow" />
        <span className="s-xp">340 XP</span>
        <span className="s-xp">6 day streak</span>
      </div>
      <div className="s-trail" aria-hidden="true">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M8 78 C 16 40, 20 40, 24 40 S 36 70, 42 70 S 52 30, 58 30 S 70 62, 74 62 S 86 28, 92 28" stroke="#1f3b53" strokeWidth="3" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <path d="M8 78 C 16 40, 20 40, 24 40 S 36 70, 42 70 S 52 30, 58 30" stroke="#a9d35c" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="1 7" vectorEffect="non-scaling-stroke" />
        </svg>
        {nodes.map(([x, y, cls, label]) => (
          <span key={label} className={`s-node ${cls}`} style={{ left: `${x}%`, top: `${y}%` }}>{label === "Q" ? "♛" : label}</span>
        ))}
      </div>
      <div className="s-question">
        <p>Which is larger: <Frac n={7} d={10} /> or <Frac n={4} d={10} />?</p>
        <div className="s-choices">
          <span className="s-choice is-right"><Frac n={7} d={10} /></span>
          <span className="s-choice"><Frac n={4} d={10} /></span>
          <span className="s-choice">They are equal</span>
        </div>
        <p className="s-hint">Correct. Tenths are the same size, and 7 tenths is more than 4 tenths. It comes back for review tomorrow, then in 3 days.</p>
      </div>
    </figure>
  );
}

export function ReportShot() {
  const days = Array.from({ length: 40 }, (_, i) => ![5, 6, 12, 13, 19, 20, 26, 27, 33, 34].includes(i));
  return (
    <figure className="s-shot s-paper" aria-label="A printed progress report, sample data">
      <div className="s-paper-head">
        <div>
          <h4>Progress Report</h4>
          <small>Maya · Grade 4 · 1 September to 30 November · sample</small>
        </div>
        <img src="/logo-96.png" alt="" width={40} height={40} />
      </div>
      <div className="s-paper-stats">
        <div><strong>42</strong><span>Lessons</span></div>
        <div><strong>88%</strong><span>Accuracy</span></div>
        <div><strong>30</strong><span>Days</span></div>
        <div><strong>116</strong><span>Reviews</span></div>
      </div>
      <div className="s-paper-body">
        <strong style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase", color: "#5a6671" }}>Instruction days</strong>
        <div className="s-days" aria-hidden="true">{days.map((on, i) => <i key={i} className={on ? "on" : ""} />)}</div>
        <p>Maya moved from comparing same-size pieces to finding equivalent fractions on her own. Her early mistakes adding denominators have not returned in review since October.</p>
        <div className="s-sign"><span>Guide</span><span>Date</span></div>
      </div>
    </figure>
  );
}

interface CourseCard {
  slug: string; title: string; lens: string | null; gradeLevel: number | null;
  description: string | null; units: number; lessons: number; license: string; coverUrl?: string | null;
}

let coursesRequest: Promise<CourseCard[]> | null = null;

/** Published courses, fetched once per page load and shared by every section. */
export function useOpenCourses(): CourseCard[] | null {
  const [courses, setCourses] = useState<CourseCard[] | null>(null);
  useEffect(() => {
    let live = true;
    if (!coursesRequest) {
      coursesRequest = api<{ courses: CourseCard[] }>("/api/public/courses").then((d) => d.courses || []).catch(() => []);
    }
    coursesRequest.then((c) => { if (live) setCourses(c); });
    return () => { live = false; };
  }, []);
  return courses;
}

export function OpenCourses({ limit = 6, prefer }: { limit?: number; prefer?: string }) {
  const courses = useOpenCourses();
  if (courses && !courses.length) return null;
  const needle = (prefer || "").toLowerCase();
  const ranked = (courses || []).slice().sort((a, b) => {
    const score = (c: CourseCard) => (needle && `${c.title} ${c.description || ""} ${c.lens || ""}`.toLowerCase().includes(needle) ? 1 : 0);
    return score(b) - score(a);
  });
  return (
    <div className="s-courses" aria-busy={!courses}>
      {(courses ? ranked.slice(0, limit) : Array.from({ length: 3 })).map((c, i) => {
        if (!c) return <div key={i} className="s-course" style={{ minHeight: 260, opacity: .5 }} />;
        const course = c as CourseCard;
        return (
          <a key={course.slug} className="s-course" {...linkProps(`c/${course.slug}`)}>
            <div className="s-course-cover">
              {course.coverUrl ? <img src={course.coverUrl} alt="" loading="lazy" /> : <span>OPEN COURSE</span>}
            </div>
            <div className="s-course-body">
              <strong>{course.title}</strong>
              {course.description && <span style={{ color: "var(--s-ink-2)", fontSize: 15 }}>{course.description.length > 140 ? `${course.description.slice(0, 137)}...` : course.description}</span>}
              <span className="s-course-meta">
                {course.gradeLevel != null ? `Grade ${course.gradeLevel} · ` : ""}{course.lessons} lessons · {course.license}
              </span>
            </div>
          </a>
        );
      })}
    </div>
  );
}

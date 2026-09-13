// SPDX-License-Identifier: AGPL-3.0-or-later
// CoursePath: the course as a path, not a list. Units become waypoints,
// lessons become nodes on a winding SVG trail. Done glows, next pulses,
// locked is dim. The path drives a traveling avatar that advances with progress.
// Pure layout, no new API. Reuses the same LearnCourseTree the list used.
import type { LearnCourseTree } from "../../types";
import MasteryStars from "./MasteryStars";

type Node = { id: number; title: string; done: boolean; unitTitle: string; unitIdx: number; lessonIdx: number };

export default function CoursePath({
  course,
  onNavigate,
}: {
  course: LearnCourseTree;
  onNavigate: (route: string) => void;
}) {
  const flat: Node[] = [];
  course.units.forEach((u, ui) => {
    u.lessons.forEach((l, li) => {
      flat.push({ id: l.id, title: l.title, done: Boolean(l.done), unitTitle: u.title, unitIdx: ui, lessonIdx: li });
    });
  });
  if (flat.length === 0) return null;

  const firstTodo = flat.findIndex((n) => !n.done);
  const pct = course.progress.lessonsTotal ? course.progress.lessonsDone / course.progress.lessonsTotal : 0;

  // Layout: vertical trail, alternating left/right nodes, SVG curve between.
  // Positions are computed so the SVG can draw one path through all nodes.
  const W = 360;
  const H_PER_STEP = 96;
  const H = Math.max(220, flat.length * H_PER_STEP + 80);
  const cx = W / 2;

  const points: { x: number; y: number; n: Node }[] = flat.map((n, i) => {
    const y = 36 + i * H_PER_STEP;
    const x = i % 2 === 0 ? cx - 42 : cx + 42;
    return { x, y, n };
  });

  // Smooth path through points: cubic Bezier between successive nodes, with
  // control points offset toward center so the line winds gently rather than zigzags hard.
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mx = (a.x + b.x) / 2;
    // Control points: pull toward center horizontally.
    const cp1x = (a.x + mx) / 2;
    const cp2x = (b.x + mx) / 2;
    const my = (a.y + b.y) / 2;
    d += ` C ${cp1x} ${my}, ${cp2x} ${my}, ${b.x} ${b.y}`;
  }

  const doneCount = flat.filter((n) => n.done).length;
  const avatarIdx = firstTodo === -1 ? flat.length - 1 : firstTodo;
  const avatar = points[avatarIdx];

  return (
    <div className="coursepath" role="region" aria-label="Course path">
      <div className="coursepath-head">
        <div className="coursepath-progress" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
          <span style={{ width: `${Math.round(pct * 100)}%` }} />
        </div>
        <p className="muted small" style={{ textAlign: "center", marginTop: 6 }}>
          {doneCount} of {flat.length} lessons done{pct === 1 ? ". You finished it! \uD83C\uDF89" : ""}
        </p>
      </div>

      <div className="coursepath-stage">
        <svg className="coursepath-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" preserveAspectRatio="xMidYMin meet">
          <path className="coursepath-track" d={d} fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <path
            className="coursepath-fill"
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${pct * 2000} 2000`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>

        <div className="coursepath-nodes" style={{ height: H }}>
          {points.map(({ x, y, n }, i) => {
            const isDone = n.done;
            const isNext = i === firstTodo;
            const isLocked = !isDone && !isNext;
            return (
              <button
                key={n.id}
                type="button"
                className={`pathnode${isDone ? " done" : ""}${isNext ? " next" : ""}${isLocked ? " locked" : ""}`}
                style={{ left: x, top: y }}
                onClick={() => onNavigate(`lesson/${n.id}`)}
                aria-label={`${n.unitIdx + 1}.${n.lessonIdx + 1} ${n.title}${isDone ? " (done)" : isNext ? " (next up)" : " (locked until earlier lessons are done)"}`}
                title={`${n.unitTitle} \u00B7 ${n.title}`}
              >
                <span className="pathnode-dot" aria-hidden="true">
                  {isDone ? "\u2713" : isNext ? "\u25C6" : String(i + 1)}
                </span>
                <span className="pathnode-label">
                  <span className="pathnode-title">{n.title}</span>
                  <span className="pathnode-unit">{n.unitTitle}</span>
                  {isDone && <MasteryStars done={true} stars={1} />}
                </span>
              </button>
            );
          })}
          <span className="pathavatar" aria-hidden="true" style={{ left: avatar.x, top: avatar.y }}>
            <span className="pathavatar-dot">\u25CF</span>
          </span>
        </div>
      </div>

      <div className="coursepath-legend muted small" aria-hidden="true">
        <span className="pathlegend done">\u2713 done</span>
        <span className="pathlegend next">\u25C6 next</span>
        <span className="pathlegend locked">1 locked</span>
      </div>
    </div>
  );
}

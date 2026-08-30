// SPDX-License-Identifier: AGPL-3.0-or-later
// Progress — time, achievements, and printable reports. Works for a
// homeschool family, a classroom, a co-op, or a self-learner tracking
// their own growth.
import { Panel, EmptyState } from "../components/ui";

export default function Records() {
  return (
    <>
      <Panel title="Progress & achievements">
        <EmptyState
          icon="📈"
          title="Progress tracking is coming"
          message="Time spent by subject, mastery over time, streaks of practice, and a portfolio of finished work — whether you homeschool, run a class, or are learning for yourself."
        />
      </Panel>
      <Panel title="Reports (planned)">
        <ul className="muted small" style={{ paddingLeft: 20, margin: 0, lineHeight: 1.9 }}>
          <li><strong style={{ color: "var(--text)" }}>Summary reports:</strong> what was studied, when, and how it went — for your own records or to hand to anyone who asks.</li>
          <li><strong style={{ color: "var(--text)" }}>Certificates:</strong> completion certificates per course, printable.</li>
          <li><strong style={{ color: "var(--text)" }}>Transcripts:</strong> formal transcripts with grades and hours — generated from real work, only where you need them.</li>
        </ul>
      </Panel>
    </>
  );
}

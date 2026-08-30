// SPDX-License-Identifier: AGPL-3.0-or-later
import { Panel, EmptyState } from "../components/ui";
import { IconSparkle } from "../components/Icons";

export default function Courses() {
  return (
    <>
      <Panel title="Courses">
        <EmptyState
          icon="✨"
          title="The AI Course Studio is the next milestone"
          message="Describe a topic, a level, and your learner's interests — get a full course with lessons, exercises, and projects. Everything editable before your kids ever see it."
          action={
            <a
              className="btn primary"
              href="https://github.com/wellofwisdom/wellofwisdom#roadmap"
              target="_blank"
              rel="noreferrer"
            >
              <IconSparkle /> Follow the build on GitHub
            </a>
          }
        />
      </Panel>
      <Panel title="What's coming">
        <ul className="muted small" style={{ paddingLeft: 20, margin: 0, lineHeight: 1.9 }}>
          <li><strong style={{ color: "var(--text)" }}>Lenses:</strong> the same math through sewing, Minecraft, or basketball — your kid's interests become the course material.</li>
          <li><strong style={{ color: "var(--text)" }}>Socratic tutor:</strong> hints instead of answers, with strictness you control and every chat visible to you.</li>
          <li><strong style={{ color: "var(--text)" }}>Spaced review:</strong> skills come back right before they'd be forgotten.</li>
          <li><strong style={{ color: "var(--text)" }}>Print packs:</strong> any lesson as a worksheet for screen-free days.</li>
        </ul>
      </Panel>
    </>
  );
}

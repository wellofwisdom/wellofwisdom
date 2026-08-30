// SPDX-License-Identifier: AGPL-3.0-or-later
import { Panel, EmptyState } from "../components/ui";

export default function Records() {
  return (
    <Panel title="Homeschool records">
      <EmptyState
        icon="📋"
        title="Records arrive in Phase 3"
        message="Attendance, hours by subject, portfolios, report cards, and transcripts that print like the real thing — all generated from the work your learners actually did."
      />
    </Panel>
  );
}

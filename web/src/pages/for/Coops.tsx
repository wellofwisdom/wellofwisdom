// SPDX-License-Identifier: AGPL-3.0-or-later
import { ForChrome, Section } from "./ForLayout";
import { linkProps } from "../../router";

export default function Coops() {
  return (
    <ForChrome
      eyebrow="For co-ops"
      title="One place for many families to learn together"
      lead="Share one instance across families, publish courses once, and keep each family's learners, reports, and attendance separate. Co-op pricing on request when managed hosting opens."
      tag="community"
      tagTitle="Shared courses from co-ops"
    >
      <Section title="What a co-op gets">
        <div className="mgrid three">
          <div className="mcard small"><h3>Families, not one roster</h3><p>Each family owns its learners, courses, and reports. Guides see only their own family.</p></div>
          <div className="mcard small"><h3>Publish once</h3><p>Any course can be published to <a {...linkProps("c")}>/c</a> and imported by every family in one paste.</p></div>
          <div className="mcard small"><h3>Attendance that files</h3><p>Instruction days per learner, editable, CSV export for the office. Excluded days stay out of the count.</p></div>
        </div>
      </Section>
      <Section title="Invite and run">
        <ol className="steps">
          <li><span className="snum">1</span><div><strong>Create the co-op family</strong><span>Start a host family, add guides as parents.</span></div></li>
          <li><span className="snum">2</span><div><strong>Author courses</strong><span>Use Studio together. Every edit stays reviewable.</span></div></li>
          <li><span className="snum">3</span><div><strong>Share the gallery</strong><span>Families import what they need. No platform in the middle.</span></div></li>
          <li><span className="snum">4</span><div><strong>Report</strong><span>Each learner gets a quarterly report and a printable portfolio.</span></div></li>
        </ol>
        <div className="mctaRow" style={{ justifyContent: "center", marginTop: 16 }}>
          <a className="btn primary" {...linkProps("dashboard")}>Create the co-op</a>
          <a className="btn" {...linkProps("privacy")}>How children's data is handled</a>
        </div>
      </Section>
    </ForChrome>
  );
}

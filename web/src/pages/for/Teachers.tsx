// SPDX-License-Identifier: AGPL-3.0-or-later
import { ForChrome, Section } from "./ForLayout";
import { linkProps } from "../../router";

export default function Teachers() {
  return (
    <ForChrome
      eyebrow="For teachers"
      title="A classroom that still fits your grading book"
      lead="Generate full courses with sources you choose, keep every answer reviewable before learners see it, track progress and misconceptions per learner, and print the artifacts your school wants: reports, portfolios, and attendance."
      tag="grade"
      tagTitle="Shared courses teachers publish"
    >
      <Section title="What a classroom gets">
        <div className="mgrid three">
          <div className="mcard small"><h3>Grounded generation</h3><p>Paste text or links. Generation stays close to your sources. You edit every word before publish.</p></div>
          <div className="mcard small"><h3>Spaced practice</h3><p>Review is scheduled 1 to 3 to 7 days out, across every course, and shows only what is due.</p></div>
          <div className="mcard small"><h3>Artifacts that print</h3><p>Reports, work samples with guide feedback, assessments as given, attendance CSV.</p></div>
        </div>
      </Section>
      <Section title="Run it in your room">
        <ol className="steps">
          <li><span className="snum">1</span><div><strong>Make a class family</strong><span>Add learners. Set growth areas per child.</span></div></li>
          <li><span className="snum">2</span><div><strong>Author or import</strong><span>Generate in Studio, or import a <code className="k">.wow-course.json</code> from <a {...linkProps("c")}>Shared courses</a>.</span></div></li>
          <li><span className="snum">3</span><div><strong>Review and publish</strong><span>Nothing reaches a learner until you publish it.</span></div></li>
          <li><span className="snum">4</span><div><strong>Track and share</strong><span>Progress, tutor log, and misconceptions per learner. Print when needed.</span></div></li>
        </ol>
        <div className="mctaRow" style={{ justifyContent: "center", marginTop: 16 }}>
          <a className="btn primary" {...linkProps("dashboard")}>Create your class</a>
          <a className="btn" {...linkProps("self-host")}>Run it on the school server</a>
        </div>
      </Section>
    </ForChrome>
  );
}

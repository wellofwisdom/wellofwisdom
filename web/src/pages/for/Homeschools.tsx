// SPDX-License-Identifier: AGPL-3.0-or-later
import { ForChrome, Section } from "./ForLayout";
import { linkProps } from "../../router";

export default function Homeschools() {
  return (
    <ForChrome
      eyebrow="For homeschools"
      title="A full curriculum that bends to what your child loves"
      lead="Turn any topic into a course in minutes, with spaced review that sticks, printable portfolios your state will accept, and attendance derived from real work. Your server, your data, offline when you want it."
      tag="homeschool"
      tagTitle="Shared courses homeschool families publish"
    >
      <Section title="Why homeschool families use it">
        <div className="mgrid three">
          <div className="mcard small"><h3>Through their lens</h3><p>Fractions through sewing, physics through skateboarding, biology through horses. Same skill, different world.</p></div>
          <div className="mcard small"><h3>Spaced review</h3><p>Every answer feeds a 1 to 3 to 7 day scheduler. Learners get a due queue across every course, automatically.</p></div>
          <div className="mcard small"><h3>Printable records</h3><p>Quarterly reports, work samples with your feedback, assessments as the report gave them, attendance CSV for the office.</p></div>
        </div>
      </Section>
      <Section title="How a homeschool day works">
        <ol className="steps">
          <li><span className="snum">1</span><div><strong>Pick who</strong><span>Grade and interests. One child or many.</span></div></li>
          <li><span className="snum">2</span><div><strong>Name what</strong><span>Topic and grade. Paste a link or your notes to ground it.</span></div></li>
          <li><span className="snum">3</span><div><strong>Add a lens</strong><span>Skateboarding, sewing, dinosaurs: every example rewrites.</span></div></li>
          <li><span className="snum">4</span><div><strong>Publish</strong><span>Review every word, publish to learners, watch them walk the world.</span></div></li>
        </ol>
        <div className="mctaRow" style={{ justifyContent: "center", marginTop: 16 }}>
          <a className="btn primary" {...linkProps("dashboard")}>Generate your first course</a>
          <a className="btn" {...linkProps("self-host")}>Or run it on your own box</a>
        </div>
      </Section>
    </ForChrome>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
import { LegalChrome } from "./LegalLayout";

export default function Terms() {
  return (
    <LegalChrome path="terms" title="Terms of Service" updated="16 September 2026">
      <h2>The short version</h2>
      <p>Well of Wisdom is open source under <strong>AGPL-3.0</strong>. Run it yourself for free, forever. Hosted service adds convenience, not a different license.</p>

      <h2>License</h2>
      <p>The code is AGPL-3.0. You may use, study, share, and modify it. If you run a modified version and let others use it over a network, you must share the source of that modified version. Course content you create is yours. The name Well of Wisdom is reserved, so a fork that diverges meaningfully should rebrand.</p>

      <h2>What you agree to</h2>
      <ul>
        <li>Use the service lawfully and do not abuse it, scrape at a rate that harms it, or try to break it.</li>
        <li>Keep your credentials safe. You are responsible for activity under your account.</li>
        <li>Only upload material you have the right to use. You keep your rights, and you give us only the permission needed to run the service and show your published courses where you asked us to.</li>
      </ul>

      <h2>Guides and learners</h2>
      <p>A guide creates a family and owns its data. Learners belong to that family. An observer may read but not change data. A guide is responsible for learners in their family and for any personal information they add.</p>

      <h2>AI</h2>
      <p>Course generation and tutoring use the AI endpoint you configure. Output may be wrong and must be reviewed before a learner sees it. You decide what is true.</p>

      <h2>Availability</h2>
      <p>Self-host runs on your hardware. Availability is up to you. Hosted service is best effort, and we pause or cancel accounts only when needed for abuse, law, or safety, with notice where possible.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, the service is provided as is, without warranty. Use good judgment when teaching children. Nothing here is legal or filing advice for your state.</p>

      <h2>Changes</h2>
      <p>We post changes to this page with a new date. Continued use after that date means you accept the change.</p>

      <h2>Contact</h2>
      <p>Questions about the service: support@wellofwisdom.app. Questions about data and privacy: privacy@wellofwisdom.app. Business, press and partnerships: kevin@wellofwisdom.app.</p>
    </LegalChrome>
  );
}

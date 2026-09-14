// SPDX-License-Identifier: AGPL-3.0-or-later
import { LegalChrome } from "./LegalLayout";

export default function Children() {
  return (
    <LegalChrome path="children" title="Children's data" updated="13 September 2026">
      <p><strong>Plain English.</strong> Well of Wisdom is built for children. A parent is in charge, and less data is better.</p>

      <h2>What we store about a child</h2>
      <ul>
        <li>Name or nickname you type, username, grade, interests, and an optional photo you upload.</li>
        <li>The work they do: lesson completions, exercise answers, projects and your feedback, attendance days, badges, and calendar events.</li>
        <li>A 4 to 6 digit PIN you set so the child can sign in. No email is required.</li>
      </ul>
      <p>We do not ask a child for an email, phone, or location. We do not profile a child for ads.</p>

      <h2>What leaves your server</h2>
      <p>On self-host, nothing leaves your server unless you configure it:</p>
      <ul>
        <li><strong>AI.</strong> If you set an AI endpoint, lesson prompts and tutor messages go to the provider you chose. You see every transcript.</li>
        <li><strong>Google sign in.</strong> Only the guide's credential goes to Google to verify it. Children do not use Google sign in.</li>
      </ul>
      <p>On <strong>wellofwisdom.app</strong> itself, data is sent as needed to run the service: its AI provider, media jobs to kie.ai, email through SparkPost, traffic through Cloudflare, and Google when you use Google sign in.</p>

      <h2>How a parent reviews and deletes a child's data</h2>
      <ul>
        <li>See all of a child's work in Progress, Portfolio, Attendance, Work, and the tutor log.</li>
        <li>Delete a learner in Learners. That removes their lessons, submissions, attendance, and badges.</li>
        <li>Courses, reports, uploads, and calendar events can be deleted individually by their owner.</li>
        <li>Export first if you want a copy: Courses export as <code className="k">.wow-course.json</code>, and the whole portfolio prints to PDF.</li>
      </ul>

      <h2>Hosting</h2>
      <p>On self-host you are the host and you control the database and uploads volume. On managed hosting we store the same data on your behalf, we back it up [placeholder: Kevin to confirm schedule], and we delete it within 30 days when you close the account [placeholder: Kevin to confirm retention period].</p>

      <h2>Contact</h2>
      <p>If you have a question about a child's data, contact the guide who runs the family. For the hosted service, email privacy@wellofwisdom.app [placeholder: Kevin to confirm private contact address].</p>
    </LegalChrome>
  );
}

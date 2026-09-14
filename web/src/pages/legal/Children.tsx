// SPDX-License-Identifier: AGPL-3.0-or-later
import { LegalChrome } from "./LegalLayout";

export default function Children() {
  return (
    <LegalChrome title="Children's data" updated="13 September 2026">
      <p><strong>Plain English.</strong> Well of Wisdom is built for children. A parent is in charge, and less data is better.</p>

      <h2>What we store about a child</h2>
      <ul>
        <li>Name or nickname you type, username, grade, interests, and an optional photo you upload.</li>
        <li>The work they do: lesson completions, exercise answers, projects and your feedback, attendance days, badges, and calendar events.</li>
        <li>A 4 to 6 digit PIN you set so the child can sign in. No email is required.</li>
      </ul>
      <p>We do not ask a child for an email, phone, or location. We do not profile a child for ads.</p>

      <h2>What leaves your server</h2>
      <p>By default, nothing.</p>
      <ul>
        <li><strong>On your own server:</strong> data stays in your Postgres. If you set no AI endpoint, no prompts leave at all.</li>
        <li><strong>With an AI endpoint:</strong> lesson prompts and tutor messages go to the provider you chose, to generate the answer. You see every transcript.</li>
        <li><strong>With Google sign in:</strong> only the guide's credential goes to Google to verify it. Children do not use Google sign in.</li>
      </ul>

      <h2>How a parent reviews and deletes everything</h2>
      <ul>
        <li>See all of a child's work in Progress, Portfolio, Attendance, Work, and the tutor log.</li>
        <li>Delete a learner in Learners. That removes their lessons, submissions, attendance, and badges.</li>
        <li>Delete the whole family in Settings. That removes every learner, course, upload, and report for the family.</li>
        <li>Export first if you want a copy: Courses export as <code className="k">.wow-course.json</code>, and the whole portfolio prints to PDF.</li>
      </ul>

      <h2>Hosting</h2>
      <p>On self-host you are the host and you control the database and uploads volume. On managed hosting we store the same data on your behalf, we back it up, and we delete it within 30 days when you close the account.</p>

      <h2>Contact</h2>
      <p>If you have a question about a child's data, contact the guide who runs the family. For the hosted service, use the contact on the site.</p>
    </LegalChrome>
  );
}

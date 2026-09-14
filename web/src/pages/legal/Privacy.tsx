// SPDX-License-Identifier: AGPL-3.0-or-later
import { LegalChrome } from "./LegalLayout";

export default function Privacy() {
  return (
    <LegalChrome title="Privacy Policy" updated="13 September 2026">
      <p><strong>In short.</strong> Self-hosted means your data sits on your server. The hosted option, when it opens, keeps only what it needs to run your school.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Accounts.</strong> Guide: name, email, password hash. Learner: family code, username, PIN, grade and interests.</li>
        <li><strong>Learning data.</strong> Courses, lessons, submissions, grades, attendance, progress, badges, tutor messages, calendar events, library and notes.</li>
        <li><strong>Files you upload.</strong> Images, audio, video, captions, course packages.</li>
        <li><strong>Waitlist.</strong> Email and interest when you join the managed hosting waitlist.</li>
        <li><strong>Logs.</strong> Server error logs with a request id. No learner path tracking.</li>
      </ul>

      <h2>What leaves your box</h2>
      <p>On self-host, nothing leaves your server unless you configure it:</p>
      <ul>
        <li><strong>AI.</strong> When you set <code className="k">AI_BASE_URL</code> and <code className="k">AI_API_KEY</code>, prompts go to that provider. With no endpoint, generation and tutoring stay off and the rest of the app keeps working. Offline with Ollama keeps everything local.</li>
        <li><strong>Google sign in.</strong> When <code className="k">GOOGLE_CLIENT_ID</code> is set, a credential goes to Google to verify it. Without it, sign in is email only.</li>
        <li><strong>Links you paste.</strong> Course sources and import URLs are fetched from the server to check them. Private and loopback addresses are refused.</li>
      </ul>
      <p>On <strong>wellofwisdom.app</strong> itself (the hosted service), data is sent as needed to run the service: prompts to its configured AI provider, media jobs to kie.ai, email through SparkPost, traffic through Cloudflare, and Google when you use Google sign in.</p>
      <p>There are no third party trackers on learner paths, no ads, and no sale of data.</p>

      <h2>How we store and protect it</h2>
      <ul>
        <li>Passwords and learner PINs are hashed with scrypt (Node crypto.scrypt). Sessions are HTTP only cookies.</li>
        <li>Data lives in Postgres on your server, or on the hosted server you choose.</li>
        <li>Uploads live on the volume you mount as <code className="k">UPLOAD_DIR</code>.</li>
        <li>Backups are your responsibility on self-host. On hosted, backups are planned as daily and restorable on request [placeholder: Kevin to confirm schedule and restore process].</li>
      </ul>

      <h2>Retention and deletion</h2>
      <p>A parent can delete a learner, a course, or a report. A hosted account can be closed by email, and data is removed within 30 days [placeholder: Kevin to confirm retention period]. The waitlist email can be removed on request.</p>

      <h2>Cookies</h2>
      <p>One session cookie keeps you signed in. No analytics cookies.</p>

      <h2>Contact</h2>
      <p>For privacy questions or deletion requests, email privacy@wellofwisdom.app [placeholder: Kevin to confirm private contact address]. We answer on a best effort basis.</p>
    </LegalChrome>
  );
}

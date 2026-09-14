// SPDX-License-Identifier: AGPL-3.0-or-later
import { ForChrome, Section } from "./ForLayout";
import { linkProps } from "../../router";

export default function SelfHost() {
  return (
    <ForChrome
      eyebrow="Self-host"
      title="One command to run. Your box. Offline if you want it."
      lead="AGPL-3.0, Docker, and any OpenAI-compatible endpoint or a local model. No platform between you and your learners."
      tag="self-host"
      tagTitle="Shared courses: any instance can import these"
    >
      <Section title="Run it">
        <div className="mcard">
          <h3>Self-host in one command</h3>
          <pre className="codeblock" style={{ marginTop: 10 }}><code>git clone https://github.com/wellofwisdom/wellofwisdom
cd wellofwisdom
docker compose up -d</code></pre>
          <p className="muted small" style={{ marginTop: 10 }}>
            Then open <code className="k">http://localhost:3000</code>. Or with local AI:
            {" "}<code className="k">docker compose --profile local-ai up -d</code> then{" "}
            <code className="k">docker compose exec ollama ollama pull llama3.1</code>.
          </p>
        </div>
        <div className="mgrid three" style={{ marginTop: 16 }}>
          <div className="mcard small"><h3>Your database</h3><p>Postgres on your volume. Uploads on your disk. Take it with you or delete it: courses export as <code className="k">.wow-course.json</code>.</p></div>
          <div className="mcard small"><h3>Bring any AI</h3><p>OpenAI, DeepSeek, Claude, Gemini, Ollama, LM Studio. One <code className="k">AI_BASE_URL</code> and <code className="k">AI_API_KEY</code>. No endpoint needed for the rest.</p></div>
          <div className="mcard small"><h3>No tracking</h3><p>Learner paths have no tracker. Invite gating and rate limits work without phoning home.</p></div>
        </div>
        <div className="mctaRow" style={{ justifyContent: "center", marginTop: 16 }}>
          <a className="btn primary" href="https://github.com/wellofwisdom/wellofwisdom" target="_blank" rel="noreferrer">Get the code</a>
          <a className="btn" {...linkProps("dashboard")}>Or make a group here</a>
        </div>
      </Section>
    </ForChrome>
  );
}

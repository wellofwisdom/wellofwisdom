// SPDX-License-Identifier: AGPL-3.0-or-later
// Learner profile: a real page, not a modal. Sections grow naturally:
// identity → interests (tags) → AI notes (WYSIWYG) → notifications.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { useNavigate } from "../router";
import type { Learner } from "../types";
import RichTextEditor from "../lib/RichTextEditor";
import TagInput from "../components/TagInput";

const INTEREST_SUGGESTIONS = [
  "sewing", "Minecraft", "basketball", "baking", "horses", "space",
  "dinosaurs", "skateboarding", "drawing", "video games", "cooking", "cars",
  "fashion design", "music", "soccer", "robotics", "anime", "nature",
  "history", "ocean animals", "architecture", "photography",
];

const READING_LEVELS = ["", "below grade", "at grade", "above grade"];

export default function LearnerForm({ learnerId, onSaved }:
  { learnerId: number | null; onSaved?: () => Promise<void> | void }) {
  const navigate = useNavigate();
  const editing = learnerId !== null;

  // identity
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [gradeLevel, setGradeLevel] = useState("");
  const [readingLevel, setReadingLevel] = useState("");
  // interests
  const [interests, setInterests] = useState<string[]>([]);
  // AI notes
  const [aiNotes, setAiNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  // state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) return;
    api<{ learners: Learner[] }>("/api/me").then((d) => {
      const l = (d.learners || []).find((x) => x.id === learnerId);
      if (!l) { navigate("learners"); return; }
      setName(l.name);
      setUsername(l.username);
      setEmail(l.email || "");
      setGradeLevel(l.grade_level ? String(l.grade_level) : "");
      setReadingLevel(l.reading_level || "");
      setInterests(l.interests || []);
      setAiNotes(l.ai_notes || "");
      setNotesSaved(Boolean(l.ai_notes));
    }).catch(() => {});
  }, [learnerId, editing, navigate]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        name,
        gradeLevel: gradeLevel === "" ? null : Number(gradeLevel),
        readingLevel: readingLevel || null,
        interests,
        aiNotes: aiNotes || null,
        email: email || null,
      };
      if (editing) {
        if (pin) body.pin = pin;
        await api(`/api/family/learners/${learnerId}`, { method: "PATCH", body });
      } else {
        body.username = username;
        body.pin = pin;
        await api("/api/family/learners", { method: "POST", body });
      }
      // Refetch before navigating — the list renders from App's `me`, so
      // without this a new learner does not appear until a manual reload.
      await onSaved?.();
      navigate("learners");
    } catch (e) {
      setError(niceError(e));
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || !window.confirm(`Remove ${name}? Their progress is removed too. This cannot be undone.`)) return;
    await api(`/api/family/learners/${learnerId}`, { method: "DELETE" }).catch(() => {});
    await onSaved?.();
    navigate("learners");
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn ghost" type="button" onClick={() => navigate("learners")}>← Learners</button>
        <h1 style={{ fontSize: 24, margin: 0 }}>{editing ? name || "Edit learner" : "Add a learner"}</h1>
      </div>

      {error && <div className="formerror" role="alert">{error}</div>}

      <section className="panel step">
        <div className="stepnum" aria-hidden="true">{editing ? "🧑‍🎓" : "1"}</div>
        <div className="grow">
          <h2>Who are they?</h2>
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <div className="grow">
              <div className="field">
                <label>What should we call them?</label>
                <input className="input biginput" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Maya, Ms. Rivera, Alex…" maxLength={80} autoFocus={!editing} />
                <div className="hint">Just what they go by — first name, nickname, formal, anything.</div>
              </div>
            </div>
            <div style={{ maxWidth: 130 }}>
              <div className="field">
                <label>Grade</label>
                <select className="input" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
                  <option value="">—</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>Grade {g}</option>)}
                  <option value="13">College</option>
                  <option value="14">Adult</option>
                </select>
              </div>
            </div>
            <div style={{ maxWidth: 150 }}>
              <div className="field">
                <label>Reading level</label>
                <select className="input" value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
                  {READING_LEVELS.map((r) => <option key={r} value={r}>{r || "Auto"}</option>)}
                </select>
              </div>
            </div>
          </div>

          {!editing && (
            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              <div className="grow">
                <div className="field">
                  <label>Username (their login)</label>
                  <input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="maya, alex_t, wizard99…" autoCapitalize="none"
                    name="learner-username" autoComplete="off" autoCorrect="off" spellCheck={false}
                    data-lpignore="true" data-1p-ignore data-form-type="other" />
                  <div className="hint">Lowercase letters and numbers, no spaces.</div>
                </div>
              </div>
              <div style={{ maxWidth: 140 }}>
                <div className="field">
                  <label>PIN</label>
                  <input className="input" type="password" inputMode="numeric" value={pin}
                    onChange={(e) => setPin(e.target.value)} placeholder="4-6 digits"
                    name="learner-pin" autoComplete="new-password"
                    data-lpignore="true" data-1p-ignore data-form-type="other" />
                </div>
              </div>
            </div>
          )}
          {editing && (
            <div className="row" style={{ gap: 12, marginTop: 8 }}>
              <div style={{ maxWidth: 140 }}>
                <div className="field">
                  <label>New PIN (optional)</label>
                  <input className="input" type="password" inputMode="numeric" value={pin}
                    onChange={(e) => setPin(e.target.value)} placeholder="Leave blank to keep"
                    name="learner-new-pin" autoComplete="new-password"
                    data-lpignore="true" data-1p-ignore data-form-type="other" />
                </div>
              </div>
              <div className="grow" style={{ paddingTop: 28 }}>
                <span className="chip">Username: @{username} (can't change)</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="panel step">
        <div className="stepnum" aria-hidden="true">2</div>
        <div className="grow">
          <h2>What do they love?</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>
            These become the <strong>lens</strong> — the AI weaves them through every course.
            Type and press Enter to add.
          </p>
          <TagInput
            tags={interests}
            onChange={(t) => setInterests(t)}
            placeholder="sewing, Minecraft, horses, baking…"
            suggestions={INTEREST_SUGGESTIONS}
            label=""
          />
        </div>
      </section>

      <section className="panel step">
        <div className="stepnum" aria-hidden="true">3</div>
        <div className="grow">
          <h2>🧠 AI notes — remembered for every course</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Standing instructions the AI applies automatically. Format with the toolbar or type "/" for blocks.
          </p>
          <RichTextEditor
            value={aiNotes}
            onChange={(v) => { setAiNotes(v); setNotesSaved(false); }}
            rows={5}
            placeholder="Struggles with common denominators. Loves period dramas. Keep examples kind and funny. Needs visual explanations."
          />
          {editing && !notesSaved && aiNotes && (
            <p className="hint" style={{ marginTop: 4, color: "var(--warn)" }}>Unsaved changes — click Save below.</p>
          )}
        </div>
      </section>

      <section className="panel step">
        <div className="stepnum" aria-hidden="true">4</div>
        <div className="grow">
          <h2>📧 Email (optional)</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>
            If they have an email, they can receive reminder notifications. Login stays username + PIN regardless.
          </p>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="maya@example.com (leave blank if none)"
            name="learner-email" autoComplete="off"
            data-lpignore="true" data-1p-ignore data-form-type="other" />
        </div>
      </section>

      <div className="stickybar">
        {editing && (
          <button className="btn danger" type="button" disabled={busy} onClick={remove}>Remove learner</button>
        )}
        <div className="grow" />
        <button className="btn" type="button" onClick={() => navigate("learners")}>Cancel</button>
        <button className="btn primary big" type="button" disabled={busy || !name.trim() || (!editing && (!username.trim() || !pin.trim()))} onClick={save}>
          {busy ? "Saving…" : editing ? "Save changes" : "Add learner"}
        </button>
      </div>
    </>
  );
}

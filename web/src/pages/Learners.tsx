// SPDX-License-Identifier: AGPL-3.0-or-later
// Learners management: list, add, edit, delete. PINs are write-only.
import { useState } from "react";
import { api, niceError } from "../api";
import type { Learner, MeResponse } from "../types";
import { Panel, Modal, Field, EmptyState } from "../components/ui";
import { IconPlus, IconPencil, IconTrash } from "../components/Icons";

const GRADES = Array.from({ length: 14 }, (_, i) => i + 1);
const READINGS = ["", "below grade", "at grade", "above grade"];

export default function Learners({ me, onChanged }: { me: MeResponse; onChanged: () => void }) {
  const learners = me.learners || [];
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Learner | null>(null);
  const [deleting, setDeleting] = useState<Learner | null>(null);
  const [error, setError] = useState("");

  return (
    <>
      <Panel
        title="Your learners"
        side={`${learners.length} ${learners.length === 1 ? "learner" : "learners"}`}
      >
        {learners.length === 0 ? (
          <EmptyState
            icon="🧒"
            title="No learners yet"
            message="Add each of your kids. They'll sign in with the family code, a username, and a PIN — no email needed."
            action={
              <button className="btn primary" type="button" onClick={() => setAdding(true)}>
                <IconPlus /> Add your first learner
              </button>
            }
          />
        ) : (
          <>
            {learners.map((l) => (
              <div className="learnerrow" key={l.id}>
                <span className="avatar" aria-hidden="true">{l.name.slice(0, 1).toUpperCase()}</span>
                <div className="meta">
                  <div className="n">{l.name}</div>
                  <div className="u">@{l.username}{l.grade_level ? ` · grade ${l.grade_level}` : ""}</div>
                </div>
                <div className="chips">
                  {l.ai_notes && <span className="chip" title="Has remembered AI notes">🧠</span>}
                  {l.interests.slice(0, 3).map((i) => (
                    <span className="chip" key={i}>{i}</span>
                  ))}
                  {l.interests.length > 3 && <span className="chip">+{l.interests.length - 3}</span>}
                </div>
                <button className="iconbtn" aria-label={`Edit ${l.name}`} type="button"
                  onClick={() => setEditing(l)}>
                  <IconPencil />
                </button>
                <button className="iconbtn" aria-label={`Remove ${l.name}`} type="button"
                  onClick={() => setDeleting(l)}>
                  <IconTrash />
                </button>
              </div>
            ))}
            <div style={{ marginTop: 14 }}>
              <button className="btn" type="button" onClick={() => setAdding(true)}>
                <IconPlus /> Add learner
              </button>
            </div>
          </>
        )}
        {error && <div className="formerror" role="alert" style={{ marginTop: 12 }}>{error}</div>}
      </Panel>

      <Panel title="How learners sign in" side="kid-friendly">
        <p className="muted small">
          Learners sign in with three things from any device: the family code{" "}
          <code className="k">{me.user?.joinCode}</code>, their username, and their PIN.
          No email, no personal data — just learning.
        </p>
      </Panel>

      {adding && (
        <LearnerForm
          title="Add a learner"
          onClose={() => setAdding(false)}
          onSubmit={async (body) => {
            await api("/api/family/learners", { method: "POST", body });
            onChanged();
            setAdding(false);
          }}
          onError={(e) => setError(niceError(e))}
        />
      )}
      {editing && (
        <LearnerForm
          title={`Edit ${editing.name}`}
          learner={editing}
          onClose={() => setEditing(null)}
          onSubmit={async (body) => {
            await api(`/api/family/learners/${editing.id}`, { method: "PATCH", body });
            onChanged();
            setEditing(null);
          }}
          onError={(e) => setError(niceError(e))}
        />
      )}
      {deleting && (
        <Modal title={`Remove ${deleting.name}?`} onClose={() => setDeleting(null)}>
          <p className="muted" style={{ marginBottom: 16 }}>
            This removes their account and progress from this server. This cannot be undone.
          </p>
          <div className="row">
            <button className="btn" type="button" onClick={() => setDeleting(null)}>Cancel</button>
            <button
              className="btn danger"
              type="button"
              onClick={async () => {
                try {
                  await api(`/api/family/learners/${deleting.id}`, { method: "DELETE" });
                  setDeleting(null);
                  onChanged();
                } catch (err) {
                  setError(niceError(err));
                  setDeleting(null);
                }
              }}
            >
              Remove learner
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function LearnerForm({
  title,
  learner,
  onClose,
  onSubmit,
  onError,
}: {
  title: string;
  learner?: Learner;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
  onError: (err: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(learner?.name ?? "");
  const [username, setUsername] = useState(learner?.username ?? "");
  const [pin, setPin] = useState("");
  const [gradeLevel, setGradeLevel] = useState<string>(learner?.grade_level ? String(learner.grade_level) : "");
  const [interests, setInterests] = useState((learner?.interests || []).join(", "));
  const [readingLevel, setReadingLevel] = useState(learner?.reading_level || "");
  const [aiNotes, setAiNotes] = useState(learner?.ai_notes || "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        name,
        gradeLevel: gradeLevel === "" ? null : Number(gradeLevel),
        interests: interests.split(",").map((s) => s.trim()).filter(Boolean),
        readingLevel: readingLevel || null,
        aiNotes: aiNotes || null,
      };
      if (learner) {
        // username is fixed after creation (it's their login); PIN only if changed
        if (pin) body.pin = pin;
      } else {
        body.username = username;
        body.pin = pin;
      }
      await onSubmit(body);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Name">
          <input className="input" required maxLength={80} value={name}
            onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Username" hint={learner ? "Can't be changed after creation." : "Letters and numbers, 2–24 characters."}>
          <input className="input" required={!learner} disabled={!!learner} autoCapitalize="none"
            value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label={learner ? "New PIN (leave blank to keep)" : "PIN"} hint="4–6 digits. They'll use this to sign in.">
          <input className="input" type="password" inputMode="numeric" pattern="\d{4,6}"
            required={!learner} value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <Field label="Grade">
              <select className="input" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)}>
                <option value="">—</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>{g === 13 ? "College" : g === 14 ? "Adult" : `Grade ${g}`}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grow">
            <Field label="Reading level">
              <select className="input" value={readingLevel} onChange={(e) => setReadingLevel(e.target.value)}>
                {READINGS.map((r) => (
                  <option key={r} value={r}>{r === "" ? "—" : r}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <Field label="Interests" hint="Comma separated. This is what the AI builds lessons around — sewing, Minecraft, horses…">
          <input className="input" value={interests} onChange={(e) => setInterests(e.target.value)}
            placeholder="sewing, dinosaurs, soccer" />
        </Field>
        <Field label="🧠 AI notes (remembered for every course)"
          hint="Standing instructions the AI applies automatically: struggles, preferences, tone. **bold** · $math$ formatting supported.">
          <textarea className="input" rows={3} value={aiNotes} onChange={(e) => setAiNotes(e.target.value)}
            placeholder="Struggles with common denominators. Keep examples kind and funny." maxLength={2000} />
        </Field>
        <div className="row">
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : learner ? "Save changes" : "Add learner"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

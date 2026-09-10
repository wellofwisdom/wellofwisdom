// SPDX-License-Identifier: AGPL-3.0-or-later
// Days of instruction: the number a filing family is actually asked for.
//
// The log is derived from the work, so it starts full rather than empty. The
// guide adds the days the app never saw (a museum, a co-op class, a morning of
// reading) and strikes the ones that were not school. Then they export it.
//
// The requirement is a number the guide types in and a label they write. This
// page does not know what any state requires, says so out loud, and must not
// start pretending to: getting that wrong for a family is worse than not
// offering it at all.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, StatBar, EmptyState, Field, Modal } from "../components/ui";

interface Requirement {
  label: string | null;
  requiredDays: number | null;
  requiredHours: number | null;
  yearStartMonth: number;
}

interface Day {
  day: string;
  counted: boolean;
  source: "work" | "added" | "excluded";
  minutes: number | null;
  note: string | null;
  evidence: { attempts: number; lessons: number; submissions: number };
}

interface Summary {
  days: number;
  added: number;
  excluded: number;
  minutes: number;
  hours: number;
  requiredDays: number | null;
  requiredHours: number | null;
  daysRemaining: number | null;
  hoursRemaining: number | null;
  daysPct: number | null;
  hoursPct: number | null;
}

interface LogResponse {
  learner: { id: number; name: string };
  range: { from: string; to: string; label?: string };
  requirement: Requirement;
  days: Day[];
  summary: Summary;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pretty(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function evidenceOf(d: Day): string {
  const bits: string[] = [];
  if (d.evidence.attempts) bits.push(`${d.evidence.attempts} answer${d.evidence.attempts === 1 ? "" : "s"}`);
  if (d.evidence.lessons) bits.push(`${d.evidence.lessons} lesson${d.evidence.lessons === 1 ? "" : "s"} finished`);
  if (d.evidence.submissions) bits.push(`${d.evidence.submissions} handed in`);
  return bits.join(" · ");
}

export default function Attendance() {
  const [learners, setLearners] = useState<{ id: number; name: string; grade_level: number | null }[] | null>(null);
  const [requirement, setRequirement] = useState<Requirement | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [log, setLog] = useState<LogResponse | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingReq, setEditingReq] = useState(false);

  useEffect(() => {
    api<{ learners: typeof learners; requirement: Requirement }>("/api/attendance/learners")
      .then((d) => {
        setLearners(d.learners);
        setRequirement(d.requirement);
        if (d.learners && d.learners.length) setWho(d.learners[0].id);
      })
      .catch((e) => {
        setMsg(niceError(e));
        setLearners([]);
      });
  }, []);

  const load = useCallback(async () => {
    if (who === null) return;
    const q = from && to ? `?from=${from}&to=${to}` : "";
    try {
      const d = await api<LogResponse>(`/api/attendance/${who}${q}`);
      setLog(d);
      setRequirement(d.requirement);
      if (!from || !to) {
        setFrom(d.range.from);
        setTo(d.range.to);
      }
    } catch (e) {
      setMsg(niceError(e));
    }
  }, [who, from, to]);

  useEffect(() => { load(); }, [who]);

  async function setDay(day: string, body: { counted: boolean; minutes?: number | null; note?: string | null }) {
    try {
      await api(`/api/attendance/${who}/${day}`, { method: "PUT", body });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  async function clearDay(day: string) {
    try {
      await api(`/api/attendance/${who}/${day}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  if (learners && learners.length === 0) {
    return (
      <Panel title="Days of instruction">
        <EmptyState
          icon="🗓️"
          title="No learners to report on yet"
          message="Add a learner, and every day they do work becomes a day of instruction you can count, adjust and export."
        />
      </Panel>
    );
  }
  if (!learners) return <div className="skel" style={{ height: 180 }} />;

  const s = log?.summary;

  return (
    <>
      <Panel
        title="Days of instruction"
        side={
          <span className="row" style={{ gap: 8 }}>
            <select
              className="input small-input"
              style={{ maxWidth: 180 }}
              value={who ?? ""}
              onChange={(e) => { setLog(null); setFrom(""); setTo(""); setWho(Number(e.target.value)); }}
              aria-label="Learner"
            >
              {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button className="btn small-btn" type="button" onClick={() => setEditingReq(true)}>
              What we file
            </button>
          </span>
        }
      >
        <p className="muted small">
          Every day with work in the record counts automatically. Add the days the app never saw, strike the
          ones that were not school, then export the log.
          {requirement && requirement.requiredDays === null && requirement.requiredHours === null
            ? " No target is set, so this is just a count."
            : ""}
        </p>

        <div className="row wrap" style={{ gap: 8, alignItems: "flex-end", margin: "10px 0" }}>
          <Field label="From">
            <input className="input small-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input className="input small-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
          <button className="btn" type="button" onClick={load}>Show</button>
          <span className="grow" />
          <button className="btn" type="button" onClick={() => setAdding(true)}>+ Record a day</button>
          <a
            className="btn ghost"
            href={`/api/attendance/${who}/export.csv?from=${from}&to=${to}`}
            download
          >
            ⬇ Export CSV
          </a>
          <button
            className="btn ghost"
            type="button"
            onClick={() => window.open(`/portfolio/${who}?from=${from}&to=${to}`, "_blank")}
          >
            📁 Portfolio
          </button>
        </div>

        {s && (
          <StatBar
            stats={[
              { label: "Days counted", value: s.days },
              ...(s.requiredDays ? [{ label: `Of ${s.requiredDays}`, value: `${s.daysPct}%`, active: s.daysPct === 100 }] : []),
              ...(s.requiredDays ? [{ label: "Still to go", value: s.daysRemaining as number, active: (s.daysRemaining || 0) > 0 }] : []),
              ...(s.minutes ? [{ label: "Hours logged", value: s.hours }] : []),
              ...(s.requiredHours ? [{ label: `Of ${s.requiredHours} hours`, value: `${s.hoursPct}%` }] : []),
              { label: "Recorded by you", value: s.added },
              { label: "Struck out", value: s.excluded, active: s.excluded > 0 },
            ]}
          />
        )}
        {msg && <p className="small" role="status">{msg}</p>}
      </Panel>

      <Panel title={log ? `${log.learner.name}: ${log.range.from} to ${log.range.to}` : "Log"}>
        {log && log.days.length === 0 && (
          <EmptyState
            icon="📅"
            title="Nothing in this range yet"
            message="Days appear here as soon as there is work in the record, and you can record any day yourself."
          />
        )}
        {(log?.days || []).map((d) => (
          <div className={`checkitem${d.counted ? "" : " done"}`} key={d.day}>
            <span className="t">
              <b>{pretty(d.day)}</b>
              {d.source === "added" && <span className="tag" style={{ marginLeft: 6 }}>recorded by you</span>}
              {d.source === "excluded" && <span className="tag" style={{ marginLeft: 6 }}>not counted</span>}
              <div className="muted small" style={{ marginTop: 2 }}>
                {evidenceOf(d) || (d.counted ? "No work in the record for this day" : "")}
                {d.minutes ? ` · ${Math.round((d.minutes / 60) * 10) / 10} h` : ""}
                {d.note ? ` · ${d.note}` : ""}
              </div>
            </span>
            <span className="row" style={{ gap: 6 }}>
              {d.counted ? (
                <button className="btn ghost small-btn" type="button" onClick={() => setDay(d.day, { counted: false })}>
                  Do not count
                </button>
              ) : (
                <button className="btn ghost small-btn" type="button" onClick={() => setDay(d.day, { counted: true })}>
                  Count it
                </button>
              )}
              {d.source !== "work" && (
                <button className="btn ghost small-btn" type="button" onClick={() => clearDay(d.day)}>
                  Undo
                </button>
              )}
            </span>
          </div>
        ))}
      </Panel>

      {adding && (
        <AddDay
          onClose={() => setAdding(false)}
          onSave={async (day, minutes, note) => {
            await setDay(day, { counted: true, minutes, note });
            setAdding(false);
          }}
        />
      )}

      {editingReq && requirement && (
        <RequirementDialog
          value={requirement}
          onClose={() => setEditingReq(false)}
          onSaved={(r) => { setRequirement(r); setEditingReq(false); setFrom(""); setTo(""); load(); }}
        />
      )}
    </>
  );
}

function AddDay({ onClose, onSave }: {
  onClose: () => void;
  onSave: (day: string, minutes: number | null, note: string | null) => Promise<void>;
}) {
  const [day, setDay] = useState(today());
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Record a day" onClose={onClose}>
      <p className="muted small">
        For a day of school the app did not see: a field trip, a co-op class, a morning of reading, a
        practical project. It goes in the log beside the days the record already backs.
      </p>
      <Field label="Date"><input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
      <Field label="Hours (optional)" hint="Only if your filing counts hours.">
        <input className="input" inputMode="decimal" value={hours} placeholder="3" onChange={(e) => setHours(e.target.value)} />
      </Field>
      <Field label="What it was (optional)">
        <input className="input" value={note} placeholder="Science museum, whole morning" onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !day}
          onClick={async () => {
            setBusy(true);
            const h = Number(hours);
            await onSave(day, hours.trim() && Number.isFinite(h) ? Math.round(h * 60) : null, note.trim() || null);
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Record it"}
        </button>
      </div>
    </Modal>
  );
}

function RequirementDialog({ value, onClose, onSaved }: {
  value: Requirement;
  onClose: () => void;
  onSaved: (r: Requirement) => void;
}) {
  const [label, setLabel] = useState(value.label || "");
  const [days, setDays] = useState(value.requiredDays ? String(value.requiredDays) : "");
  const [hours, setHours] = useState(value.requiredHours ? String(value.requiredHours) : "");
  const [month, setMonth] = useState(String(value.yearStartMonth || 8));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const d = await api<{ requirement: Requirement }>("/api/attendance/requirement", {
        method: "PUT",
        body: {
          label: label.trim() || null,
          requiredDays: days.trim() ? Number(days) : null,
          requiredHours: hours.trim() ? Number(hours) : null,
          yearStartMonth: Number(month),
        },
      });
      onSaved(d.requirement);
    } catch (e) {
      setErr(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title="What we file" onClose={onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      <p className="muted small">
        These are your numbers, not ours. Homeschool rules vary by state and by circumstance and they
        change, so this app will not guess yours: look up what you have to file and put it here. Leave a
        box empty if it does not apply. Nothing here is legal advice.
      </p>
      <Field label="Call it what you like" hint="Shown on the page. For example: Ohio, or our co-op agreement.">
        <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ohio" />
      </Field>
      <Field label="Days of instruction required per year">
        <input className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} placeholder="180" />
      </Field>
      <Field label="Hours required per year (if yours counts hours)">
        <input className="input" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} placeholder="900" />
      </Field>
      <Field label="Our school year starts in">
        <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
        </select>
      </Field>
      <div className="row">
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Modal>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Calendar — events (sessions, deadlines, field trips, exams) merged with
// plan milestone target dates on one month grid.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, Modal, Field } from "../components/ui";

interface Ev {
  id: number;
  title: string;
  description: string | null;
  on_date: string;
  at_time: string | null;
  kind: string;
  plan_id: number | null;
  plan_title: string | null;
  course_id: number | null;
  course_title: string | null;
}

interface Ms {
  id: number;
  title: string;
  target_date: string;
  plan_title: string;
  plan_id: number;
}

const KIND_ICON: Record<string, string> = { session: "📖", deadline: "⏰", field_trip: "🚌", exam: "📝", other: "📌" };

export default function Calendar({ onNavigate }: { onNavigate: (hash: string) => void }) {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [milestones, setMilestones] = useState<Ms[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [editing, setEditing] = useState<Ev | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    api<{ events: Ev[]; milestones: Ms[] }>("/api/events")
      .then((d) => { setEvents(d.events); setMilestones(d.milestones); })
      .catch((e) => setError(niceError(e)));

  useEffect(() => { load(); }, []);

  const year = month.getFullYear();
  const m = month.getMonth();
  const startDay = (new Date(year, m, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const cells: (number | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 18 }}>
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <span className="muted small">
          {events?.length ?? "…"} events · {milestones.length} milestone targets
        </span>
        <div className="grow" />
        <button className="btn small-btn" type="button" onClick={() => setMonth(new Date(year, m - 1, 1))}>←</button>
        <button className="btn small-btn" type="button" onClick={() => setMonth(new Date())}>Today</button>
        <button className="btn small-btn" type="button" onClick={() => setMonth(new Date(year, m + 1, 1))}>→</button>
        <button className="btn primary" type="button" onClick={() => setAdding(true)}>＋ Add event</button>
      </div>

      {error && <div className="formerror" role="alert">{error}</div>}

      <Panel>
        <div className="calgrid">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="calhead">{d}</div>
          ))}
          {cells.map((day, i) => {
            const iso = day ? new Date(year, m, day).toISOString().slice(0, 10) : null;
            const dayEvents = iso ? (events || []).filter((e) => e.on_date === iso) : [];
            const dayMs = iso ? milestones.filter((x) => x.target_date === iso) : [];
            return (
              <div key={i} className={`calcell${iso === today ? " today" : ""}`}>
                {day && <span className="calnum">{day}</span>}
                {dayEvents.map((e) => (
                  <button key={`e${e.id}`} type="button" className="calitem evitem" title={e.title} onClick={() => setEditing(e)}>
                    {KIND_ICON[e.kind] || "📌"} {e.title.slice(0, 18)}
                  </button>
                ))}
                {dayMs.map((x) => (
                  <button key={`m${x.id}`} type="button" className="calitem" title={`${x.plan_title}: ${x.title}`}
                    onClick={() => onNavigate(`plan/${x.plan_id}`)}>
                    🗺️ {x.title.slice(0, 18)}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>

      {(adding || editing) && (
        <EventDialog
          ev={editing}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function EventDialog({ ev, onClose, onSaved }: { ev: Ev | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(ev?.title ?? "");
  const [description, setDescription] = useState(ev?.description ?? "");
  const [onDate, setOnDate] = useState(ev?.on_date ?? new Date().toISOString().slice(0, 10));
  const [atTime, setAtTime] = useState(ev?.at_time ?? "");
  const [kind, setKind] = useState(ev?.kind ?? "session");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    const body = { title, description: description || null, onDate, atTime: atTime || null, kind };
    try {
      if (ev) await api(`/api/events/${ev.id}`, { method: "PATCH", body });
      else await api("/api/events", { method: "POST", body });
      onSaved();
    } catch (e) {
      setErr(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={ev ? "Edit event" : "Add event"} onClose={onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Museum trip · Algebra session · Essay due" /></Field>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow"><Field label="Date"><input type="date" className="input" value={onDate} onChange={(e) => setOnDate(e.target.value)} /></Field></div>
        <div style={{ maxWidth: 130 }}><Field label="Time (optional)"><input className="input" value={atTime} onChange={(e) => setAtTime(e.target.value)} placeholder="10:00" /></Field></div>
        <div className="grow"><Field label="Kind">
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="session">📖 Session</option>
            <option value="deadline">⏰ Deadline</option>
            <option value="field_trip">🚌 Field trip</option>
            <option value="exam">📝 Exam</option>
            <option value="other">📌 Other</option>
          </select>
        </Field></div>
      </div>
      <Field label="Notes"><textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="row">
        {ev && (
          <button className="btn danger" type="button" disabled={busy} onClick={async () => {
            if (!window.confirm("Delete this event?")) return;
            await api(`/api/events/${ev.id}`, { method: "DELETE" }).catch(() => {});
            onSaved();
          }}>Delete</button>
        )}
        <div className="grow" />
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={save}>
          {busy ? "Saving…" : ev ? "Save" : "Add"}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>Events happening tomorrow trigger a reminder email automatically.</p>
    </Modal>
  );
}

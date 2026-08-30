// SPDX-License-Identifier: AGPL-3.0-or-later
// Resource Library — a Notion-style database: one collection, four views.
// Table for scanning, Board for status flow (drag cards), Calendar for
// scheduling, Gallery for browsing.
import { useEffect, useMemo, useState } from "react";
import { api, niceError } from "../api";
import { Panel, Modal, Field, PillTabs, EmptyState } from "../components/ui";

interface Resource {
  id: number;
  title: string;
  url: string | null;
  type: string;
  subject: string | null;
  status: string;
  rating: number;
  date_for: string | null;
  notes: string | null;
  course_id: number | null;
  course_title: string | null;
  plan_id: number | null;
  plan_title: string | null;
  created_at: string;
}

const TYPE_ICON: Record<string, string> = { link: "🔗", video: "▶️", book: "📚", tool: "🧰", place: "📍", note: "📝" };
const TYPE_LABEL: Record<string, string> = { link: "Link", video: "Video", book: "Book", tool: "Tool", place: "Place", note: "Note" };
const STATUSES: { id: string; label: string; icon: string }[] = [
  { id: "inbox", label: "Inbox", icon: "📥" },
  { id: "queued", label: "Queued", icon: "⏳" },
  { id: "in_use", label: "In use", icon: "🎯" },
  { id: "done", label: "Used", icon: "✅" },
];

type View = "table" | "board" | "calendar" | "gallery";

export default function Library() {
  const [items, setItems] = useState<Resource[] | null>(null);
  const [view, setView] = useState<View>("table");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [editing, setEditing] = useState<Resource | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(() => new Date());

  const load = () =>
    api<{ resources: Resource[] }>("/api/resources")
      .then((d) => setItems(d.resources))
      .catch((e) => setError(niceError(e)));

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const all = items || [];
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!typeFilter || r.type === typeFilter) &&
        (!needle ||
          r.title.toLowerCase().includes(needle) ||
          (r.subject || "").toLowerCase().includes(needle) ||
          (r.notes || "").toLowerCase().includes(needle))
    );
  }, [items, q, typeFilter]);

  async function move(r: Resource, status: string) {
    setItems((prev) => (prev || []).map((x) => (x.id === r.id ? { ...x, status } : x)));
    await api(`/api/resources/${r.id}`, { method: "PATCH", body: { status } }).catch(() => load());
  }

  const subjects = useMemo(() => {
    const s = new Set<string>();
    (items || []).forEach((r) => r.subject && s.add(r.subject));
    return [...s].sort();
  }, [items]);

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <PillTabs
          ariaLabel="Library view"
          tabs={[
            { id: "table", label: "☰ Table" },
            { id: "board", label: "📋 Board" },
            { id: "calendar", label: "🗓️ Calendar" },
            { id: "gallery", label: "🖼️ Gallery" },
          ]}
          value={view}
          onChange={(v) => setView(v as View)}
        />
        <div className="grow" />
        <input className="input" style={{ maxWidth: 200 }} placeholder="Search…" value={q}
          onChange={(e) => setQ(e.target.value)} aria-label="Search resources" />
        <select className="input" style={{ maxWidth: 140 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter by type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <button className="btn primary" type="button" onClick={() => setAdding(true)}>＋ Add</button>
      </div>

      {error && <div className="formerror" role="alert">{error}</div>}

      {!items ? (
        <div className="skel" style={{ height: 160 }} />
      ) : items.length === 0 ? (
        <Panel title="Library">
          <EmptyState
            icon="📚"
            title="Your resource library"
            message="Everything worth using — links, videos, books, tools, field trips. Drop it in the Inbox, queue it, use it, mark it done. Four views of the same collection."
            action={<button className="btn primary" type="button" onClick={() => setAdding(true)}>＋ Add your first resource</button>}
          />
        </Panel>
      ) : (
        <>
          {view === "table" && (
            <Panel title={`${filtered.length} resources`}>
              <div className="rtable">
                <div className="rrow rhead" aria-hidden="true">
                  <span>Title</span><span>Type</span><span>Subject</span><span>Status</span><span>Use by</span><span>★</span>
                </div>
                {filtered.map((r) => (
                  <div key={r.id} className="rrow" role="button" tabIndex={0}
                    onClick={() => setEditing(r)} onKeyDown={(e) => e.key === "Enter" && setEditing(r)}>
                    <span className="rt-title">
                      {TYPE_ICON[r.type]}{" "}
                      {r.url ? <a href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{r.title}</a> : r.title}
                    </span>
                    <span className="muted small">{TYPE_LABEL[r.type]}</span>
                    <span className="muted small">{r.subject || "—"}</span>
                    <span>
                      <select className="input small-input" value={r.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => move(r, e.target.value)} aria-label={`Status of ${r.title}`}>
                        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
                      </select>
                    </span>
                    <span className="muted small">{r.date_for || "—"}</span>
                    <span>{r.rating ? "★".repeat(r.rating) : "—"}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {view === "board" && (
            <div className="board">
              {STATUSES.map((s) => {
                const cards = filtered.filter((r) => r.status === s.id);
                return (
                  <div key={s.id}
                    className="boardcol"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      const id = Number(e.dataTransfer.getData("text/plain"));
                      const r = (items || []).find((x) => x.id === id);
                      if (r && r.status !== s.id) move(r, s.id);
                    }}>
                    <div className="boardhead">{s.icon} {s.label} <span className="muted small">({cards.length})</span></div>
                    {cards.map((r) => (
                      <div key={r.id} className="boardcard" draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", String(r.id))}
                        onClick={() => setEditing(r)} role="button" tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setEditing(r)}>
                        <div className="bc-title">{TYPE_ICON[r.type]} {r.title}</div>
                        {r.subject && <div className="bc-sub">{r.subject}</div>}
                        {r.date_for && <div className="bc-sub">🗓️ {r.date_for}</div>}
                      </div>
                    ))}
                    {cards.length === 0 && <div className="boardempty">Drop here</div>}
                  </div>
                );
              })}
            </div>
          )}

          {view === "calendar" && <CalendarView items={filtered} month={month} setMonth={setMonth} onOpen={setEditing} />}

          {view === "gallery" && (
            <div className="gallery">
              {filtered.map((r) => (
                <button key={r.id} type="button" className="galcard" onClick={() => setEditing(r)}>
                  <span className="g-icon" aria-hidden="true">{TYPE_ICON[r.type]}</span>
                  <span className="g-title">{r.title}</span>
                  <span className="g-sub">{r.subject || TYPE_LABEL[r.type]} · {STATUSES.find((s) => s.id === r.status)?.label}</span>
                  {r.rating > 0 && <span className="g-sub">{"★".repeat(r.rating)}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="muted">Nothing matches.</p>}
            </div>
          )}
        </>
      )}

      {(adding || editing) && (
        <ResourceDialog
          resource={editing}
          subjects={subjects}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={() => { setAdding(false); setEditing(null); load(); }}
        />
      )}
    </>
  );
}

function CalendarView({ items, month, setMonth, onOpen }: {
  items: Resource[];
  month: Date;
  setMonth: (d: Date) => void;
  onOpen: (r: Resource) => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const startDay = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Panel
      title={month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
      side={
        <span className="row">
          <button className="btn small-btn" type="button" onClick={() => setMonth(new Date(year, m - 1, 1))}>←</button>
          <button className="btn small-btn" type="button" onClick={() => setMonth(new Date())}>Today</button>
          <button className="btn small-btn" type="button" onClick={() => setMonth(new Date(year, m + 1, 1))}>→</button>
        </span>
      }
    >
      <div className="calgrid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="calhead">{d}</div>
        ))}
        {cells.map((day, i) => {
          const iso = day ? new Date(year, m, day).toISOString().slice(0, 10) : null;
          const dayItems = iso ? items.filter((r) => r.date_for === iso) : [];
          return (
            <div key={i} className={`calcell${iso === today ? " today" : ""}`}>
              {day && <span className="calnum">{day}</span>}
              {dayItems.map((r) => (
                <button key={r.id} type="button" className="calitem" onClick={() => onOpen(r)} title={r.title}>
                  {TYPE_ICON[r.type]} {r.title.slice(0, 18)}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function ResourceDialog({ resource, subjects, onClose, onSaved }: {
  resource: Resource | null;
  subjects: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(resource?.title ?? "");
  const [url, setUrl] = useState(resource?.url ?? "");
  const [type, setType] = useState(resource?.type ?? "link");
  const [subject, setSubject] = useState(resource?.subject ?? "");
  const [status, setStatus] = useState(resource?.status ?? "inbox");
  const [rating, setRating] = useState(String(resource?.rating ?? 0));
  const [dateFor, setDateFor] = useState(resource?.date_for ?? "");
  const [notes, setNotes] = useState(resource?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    setBusy(true);
    setErr("");
    const body = {
      title, url: url || null, type, subject: subject || null, status,
      rating: Number(rating) || 0, dateFor: dateFor || null, notes: notes || null,
    };
    try {
      if (resource) await api(`/api/resources/${resource.id}`, { method: "PATCH", body });
      else await api("/api/resources", { method: "POST", body });
      onSaved();
    } catch (e) {
      setErr(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Modal title={resource ? "Edit resource" : "Add resource"} onClose={onClose}>
      {err && <div className="formerror" role="alert">{err}</div>}
      <Field label="Title"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Khan Academy: fractions" /></Field>
      <Field label="Link (optional)"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></Field>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <Field label="Type">
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([id, label]) => <option key={id} value={id}>{TYPE_ICON[id]} {label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grow">
          <Field label="Subject">
            <input className="input" list="subjects" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Math, History…" />
            <datalist id="subjects">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        </div>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="grow">
          <Field label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="grow">
          <Field label="Use by (calendar)">
            <input type="date" className="input" value={dateFor} onChange={(e) => setDateFor(e.target.value)} />
          </Field>
        </div>
        <div style={{ maxWidth: 110 }}>
          <Field label="Rating">
            <select className="input" value={rating} onChange={(e) => setRating(e.target.value)}>
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n ? "★".repeat(n) : "—"}</option>)}
            </select>
          </Field>
        </div>
      </div>
      <Field label="Notes"><textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why it's good, which unit it fits…" /></Field>
      <div className="row">
        {resource && (
          <button className="btn danger" type="button" disabled={busy} onClick={async () => {
            if (!window.confirm("Delete this resource?")) return;
            await api(`/api/resources/${resource.id}`, { method: "DELETE" }).catch(() => {});
            onSaved();
          }}>Delete</button>
        )}
        <div className="grow" />
        <button className="btn" type="button" onClick={onClose}>Cancel</button>
        <button className="btn primary" type="button" disabled={busy || !title.trim()} onClick={save}>
          {busy ? "Saving…" : resource ? "Save" : "Add"}
        </button>
      </div>
    </Modal>
  );
}

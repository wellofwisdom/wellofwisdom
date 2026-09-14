// SPDX-License-Identifier: AGPL-3.0-or-later
// Roster import: paste or upload CSV, preview, then import and print sign-in cards.
import { useCallback, useState } from "react";
import { api, niceError } from "../api";
import { useNavigate } from "../router";
import { Panel } from "../components/ui";

interface PreviewRow {
  index: number;
  name: string;
  username: string | null;
  generatedUsername: string | null;
  grade: number | null;
  interests: string[];
  email: string | null;
  errors: string[];
  valid: boolean;
  raw: string[];
}

interface PreviewResp {
  rows: PreviewRow[];
  capExceeded: boolean;
  totalRows: number;
  ignoredBeyondCap: number;
}

interface CreatedRow {
  id: number;
  name: string;
  username: string;
  pin: string;
}

const TEMPLATE_CSV = "name,username,grade,interests,email\nMaya Smith,maya,5,sewing; horses,maya@example.com\nJon Doe,,3,space,\n";

function downloadCsv(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function RosterImport() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [created, setCreated] = useState<CreatedRow[] | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const d = await api<PreviewResp>("/api/roster/preview", { method: "POST", body: { csv: text } });
      setPreview(d);
      setCreated(null);
      try {
        const me = await api<{ user: { joinCode: string } | null }>("/api/me");
        if (me.user) setJoinCode(me.user.joinCode || "");
      } catch {}
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusy(false);
    }
  }, [text]);

  const doImport = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const d = await api<{ created: CreatedRow[]; failed: { index: number; errors: string[] }[] }>("/api/roster/import", { method: "POST", body: { csv: text } });
      setCreated(d.created);
      setPreview(null);
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusy(false);
    }
  }, [text]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
  }

  if (created) {
    return (
      <>
        <div className="row" style={{ marginBottom: 16 }}>
          <button className="btn ghost" type="button" onClick={() => navigate("learners")}>← Learners</button>
          <h1 style={{ fontSize: 24, margin: 0 }}>Roster imported</h1>
        </div>
        <Panel title="Sign-in cards" side={`${created.length} learners. Print now: PINs are shown only once.`}>
          <p className="muted small">Cut along the lines. Each card has the group code, username and PIN. PINs are stored hashed, so this page is the only time they appear in plain text.</p>
          <div className="roster-cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {created.map((r) => (
              <div key={r.id} className="roster-card" style={{ border: "1px dashed var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{r.name}</div>
                <div className="small">Group code: <code className="k">{joinCode || "-"}</code></div>
                <div className="small">Username: <code>{r.username}</code></div>
                <div className="small">PIN: <code style={{ fontSize: 16 }}>{r.pin}</code></div>
              </div>
            ))}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" type="button" onClick={() => window.print()}>Print cards</button>
            <button className="btn primary" type="button" onClick={() => navigate("learners")}>Done</button>
          </div>
        </Panel>
        <style>{`@media print { body * { visibility: hidden; } .roster-cards, .roster-cards * { visibility: visible; } .roster-cards { position: absolute; left: 0; top: 0; width: 100%; } nav, .btn { display: none !important; } }`}</style>
      </>
    );
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn ghost" type="button" onClick={() => navigate("learners")}>← Learners</button>
        <h1 style={{ fontSize: 24, margin: 0 }}>Import roster</h1>
      </div>

      {error && <div className="formerror" role="alert">{error}</div>}

      <Panel title="CSV" side="name, username (optional), grade, interests (semicolon), email (optional)">
        <p className="muted small">Accepts comma or semicolon delimiters, quoted fields, and a UTF-8 BOM. Cap 200 rows.</p>
        <div className="field">
          <label>Paste CSV</label>
          <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={TEMPLATE_CSV} />
        </div>
        <div className="row" style={{ gap: 12, marginTop: 8 }}>
          <label className="btn" style={{ cursor: "pointer" }}>
            Upload file
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
          </label>
          <button className="btn ghost" type="button" onClick={() => downloadCsv("roster-template.csv", TEMPLATE_CSV)}>Download template</button>
          <a className="btn ghost" href="/api/roster/template">Template from server</a>
          <div className="grow" />
          <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={loadPreview}>{busy ? "Checking…" : "Preview"}</button>
        </div>
      </Panel>

      {preview && (
        <Panel title={`Preview: ${preview.totalRows} rows`} side={preview.capExceeded ? "Cap exceeded (200): extra rows ignored" : `${preview.rows.filter((r) => r.valid).length} valid, ${preview.rows.filter((r) => !r.valid).length} with errors`}>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", fontSize: 14 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Grade</th>
                  <th>Interests</th>
                  <th>Email</th>
                  <th>Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.index} style={r.valid ? undefined : { background: "var(--warn-bg, #fff3cd)" }}>
                    <td>{r.index + 1}</td>
                    <td>{r.name || <span className="muted">-</span>}</td>
                    <td>{r.username || r.generatedUsername || <span className="muted">auto</span>}</td>
                    <td>{r.grade ?? "-"}</td>
                    <td>{r.interests.length ? r.interests.join(", ") : "-"}</td>
                    <td>{r.email || "-"}</td>
                    <td>{r.errors.length ? r.errors.join(", ") : <span style={{ color: "var(--good)" }}>ok</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <div className="grow" />
            <button className="btn" type="button" onClick={() => setPreview(null)}>Edit CSV</button>
            <button className="btn primary" type="button" disabled={busy || !preview.rows.some((r) => r.valid)} onClick={doImport}>{busy ? "Importing…" : `Import ${preview.rows.filter((r) => r.valid).length} learners`}</button>
          </div>
        </Panel>
      )}
    </>
  );
}

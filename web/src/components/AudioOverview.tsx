// SPDX-License-Identifier: AGPL-3.0-or-later
// Audio overviews, guide side: pick a unit, generate a two-host podcast
// summary of it, play it right here. One overview lives per unit: the server
// keeps only the newest, so regenerating replaces the old file. Learner
// surfaces come later; this panel is guide-only for now.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel } from "./ui";

interface UnitOpt { id: number; title: string }
interface ScriptLine { host: "a" | "b"; text: string }
interface OverviewRow {
  uploadId: number;
  url: string;
  title: string | null;
  createdAt: string;
  script: ScriptLine[];
  skipped: number;
}

export default function AudioOverview({ units }: { units: UnitOpt[] }) {
  const [unitId, setUnitId] = useState<number | "">(units[0]?.id ?? "");
  const [overview, setOverview] = useState<OverviewRow | null>(null);
  const [canGenerate, setCanGenerate] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ canGenerate: boolean }>("/api/overviews/status")
      .then((s) => setCanGenerate(Boolean(s.canGenerate)))
      .catch(() => setCanGenerate(false));
  }, []);

  const load = useCallback(() => {
    if (unitId === "") { setOverview(null); return; }
    api<{ overview: OverviewRow | null }>(`/api/overviews/for-unit/${unitId}`)
      .then((d) => setOverview(d.overview))
      .catch(() => setOverview(null));
  }, [unitId]);
  useEffect(() => { load(); }, [load]);

  // Jobs take a couple of minutes (one AI draft, then a TTS call per line),
  // so poll rather than await. The server keeps the last overview per unit,
  // so a finished job always shows up through a plain reload.
  async function generate() {
    if (unitId === "" || busy) return;
    setBusy(true);
    setMsg("Drafting the script, then reading it aloud. This takes a minute or two.");
    try {
      const { jobId } = await api<{ jobId: number }>("/api/overviews/generate", { method: "POST", body: { unitId } });
      for (let i = 0; i < 150; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const j = await api<{ job: { status: string; error?: string | null } }>(`/api/overviews/job/${jobId}`);
        if (j.job.status === "done") { setMsg(""); load(); setBusy(false); return; }
        if (j.job.status === "error") {
          setMsg(niceError({ code: j.job.error || "job_failed" } as never));
          setBusy(false);
          return;
        }
      }
      setMsg("Still working. The overview will appear here when the job finishes.");
      setBusy(false);
    } catch (e) {
      setMsg(niceError(e));
      setBusy(false);
    }
  }

  return (
    <Panel title="Audio overview" side="two-host summary of one unit">
      {units.length === 0 ? (
        <p className="muted small">Add lessons to a unit first: the summary is drafted from the unit's lesson text.</p>
      ) : (
        <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
          <select
            className="input"
            style={{ maxWidth: 300 }}
            value={unitId === "" ? "" : String(unitId)}
            onChange={(e) => setUnitId(e.target.value === "" ? "" : Number(e.target.value))}
            aria-label="Unit"
          >
            {units.map((u) => <option key={u.id} value={String(u.id)}>{u.title}</option>)}
          </select>
          <button className="btn primary" type="button" disabled={busy || unitId === "" || canGenerate === false} onClick={generate}>
            {busy ? "Generating…" : overview ? "↻ Regenerate" : "🎙 Generate"}
          </button>
          {canGenerate === false && (
            <span className="muted small">Needs AI and text-to-speech configured in Settings first.</span>
          )}
        </div>
      )}
      {msg && <p className="small muted" style={{ margin: "6px 0 0" }}>{msg}</p>}
      {overview && (
        <div style={{ marginTop: 10 }}>
          <audio controls preload="metadata" src={overview.url} style={{ width: "100%" }} />
          <p className="muted small" style={{ margin: "4px 0 0" }}>
            {overview.title || "Audio overview"}
            {" · "}
            {new Date(overview.createdAt).toLocaleDateString()}
            {overview.skipped > 0 ? ` · ${overview.skipped} line${overview.skipped === 1 ? "" : "s"} skipped` : ""}
          </p>
          {overview.script.length > 0 && (
            <details style={{ marginTop: 6 }}>
              <summary className="small muted" style={{ cursor: "pointer" }}>Script</summary>
              <div style={{ marginTop: 6 }}>
                {overview.script.map((l, i) => (
                  <p key={i} className="small" style={{ margin: "2px 0" }}>
                    <b>{l.host === "a" ? "Host A:" : "Host B:"}</b> {l.text}
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Panel>
  );
}

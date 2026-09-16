// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import { api, niceError } from "../../api";

type VersionRow = { id: number; createdAt: string; createdBy: number | null };

export default function VersionHistory({ courseId, onRestored }: { courseId: number; onRestored: () => void }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<{ versions: VersionRow[] }>(`/api/courses/${courseId}/versions`)
      .then((d) => setVersions(d.versions || []))
      .catch((e) => setErr(niceError(e)));
  }, [courseId]);

  async function restore(id: number) {
    if (!window.confirm("Restore this version? The current course state becomes the next version, so nothing is lost.")) return;
    setBusy(id);
    setMsg("");
    try {
      await api(`/api/courses/${courseId}/versions/${id}/restore`, { method: "POST" });
      setMsg("Restored. Reloading.");
      onRestored();
      api<{ versions: VersionRow[] }>(`/api/courses/${courseId}/versions`)
        .then((d) => setVersions(d.versions || []))
        .catch((e) => setErr(niceError(e)));
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(null);
    }
  }

  if (err) return <div className="formerror small" role="alert">{err}</div>;

  return (
    <div>
      {versions.length === 0 && <p className="muted small">No versions yet. Saving the course creates one.</p>}
      {versions.map((v) => (
        <div key={v.id} className="row" style={{ alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--border, #eee)" }}>
          <span className="small muted grow">{new Date(v.createdAt).toLocaleString()}</span>
          <button className="btn ghost small-btn" type="button" disabled={busy === v.id} onClick={() => restore(v.id)}>
            {busy === v.id ? "Restoring..." : "Restore"}
          </button>
        </div>
      ))}
      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
    </div>
  );
}

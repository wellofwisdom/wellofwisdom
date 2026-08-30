// SPDX-License-Identifier: AGPL-3.0-or-later
// Workspace — the free-form layer: nested pages for notes, links, records,
// anything. Notion-style: tree on the left, editor on the right, autosaves.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";
import RichTextEditor from "../lib/RichTextEditor";
import { RichText } from "../lib/rich";

interface PageRow {
  id: number;
  parent_id: number | null;
  title: string;
  icon: string | null;
  position: number;
  updated_at: string;
}

interface PageFull extends PageRow {
  body: string;
}

export default function Notes() {
  const [pages, setPages] = useState<PageRow[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [page, setPage] = useState<PageFull | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);

  const loadList = useCallback(() => {
    api<{ pages: PageRow[] }>("/api/notes")
      .then((d) => setPages(d.pages))
      .catch((e) => setError(niceError(e)));
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (openId == null) { setPage(null); return; }
    api<{ page: PageFull }>(`/api/notes/${openId}`)
      .then((d) => setPage(d.page))
      .catch(() => setPage(null));
  }, [openId]);

  // autosave: 900ms after the last keystroke
  useEffect(() => {
    if (!page || !dirty.current) return;
    setSaved("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        await api(`/api/notes/${page.id}`, { method: "PATCH", body: { title: page.title, body: page.body } });
        dirty.current = false;
        setSaved("saved");
        loadList();
      } catch { setSaved("idle"); }
    }, 900);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [page, loadList]);

  const markDirty = () => { dirty.current = true; };

  async function createPage(parentId: number | null) {
    try {
      const d = await api<{ id: number }>("/api/notes", { method: "POST", body: { parentId, title: "" } });
      loadList();
      setOpenId(d.id);
      if (parentId != null) setExpanded((s) => new Set([...s, parentId]));
    } catch (e) {
      setError(niceError(e));
    }
  }

  function TreeNode({ row, depth }: { row: PageRow; depth: number }) {
    const kids = (pages || []).filter((p) => p.parent_id === row.id);
    const isOpen = expanded.has(row.id);
    const active = openId === row.id;
    return (
      <div>
        <div
          className={`pagelink${active ? " on" : ""}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          role="button" tabIndex={0}
          onClick={() => { setOpenId(row.id); if (kids.length) setExpanded((s) => new Set([...s, row.id])); }}
          onKeyDown={(e) => e.key === "Enter" && setOpenId(row.id)}
        >
          {kids.length > 0 ? (
            <span
              className={`caret${isOpen ? " exp" : ""}`} aria-hidden="true"
              onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; }); }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
            </span>
          ) : <span className="caretspacer" />}
          <span aria-hidden="true">{row.icon || "📄"}</span>
          <span className="pl-title">{row.title || "Untitled"}</span>
        </div>
        {isOpen && kids.map((k) => <TreeNode key={k.id} row={k} depth={depth + 1} />)}
      </div>
    );
  }

  const roots = (pages || []).filter((p) => p.parent_id === null);

  return (
    <div className="noteswrap">
      <aside className="notesside">
        <div className="row" style={{ padding: "0 6px 10px" }}>
          <strong style={{ flex: 1 }}>Workspace</strong>
          <button className="btn small-btn" type="button" onClick={() => createPage(null)} aria-label="New page">＋</button>
        </div>
        {error && <div className="formerror" style={{ margin: "0 6px 8px" }}>{error}</div>}
        {!pages ? <div className="skel" style={{ height: 60, margin: 6 }} /> : (
          roots.length === 0 ? (
            <p className="muted small" style={{ padding: "0 10px" }}>
              Your workspace — notes, links, records, plans, anything. Create your first page.
            </p>
          ) : roots.map((r) => <TreeNode key={r.id} row={r} depth={0} />)
        )}
      </aside>

      <div className="notesmain">
        {!page ? (
          <div className="empty" style={{ paddingTop: "18vh" }}>
            <div className="eicon" aria-hidden="true">🗒️</div>
            <div className="etitle">Pick a page — or start a new one</div>
            <p className="emsg">This is your group's free space: lesson notes, reading lists, field trip plans, portfolio records. Type “/” in the editor for blocks.</p>
            <button className="btn primary" type="button" onClick={() => createPage(null)}>＋ New page</button>
          </div>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 10 }}>
              <input
                className="input biginput grow"
                style={{ border: "none", background: "transparent", padding: "6px 2px", fontWeight: 700, fontSize: 22 }}
                value={page.title}
                placeholder="Untitled"
                onChange={(e) => { markDirty(); setPage({ ...page, title: e.target.value }); }}
                aria-label="Page title"
              />
              <span className="muted small">
                {saved === "saving" ? "Saving…" : saved === "saved" ? "✓ Saved" : ""}
              </span>
              <button className="btn ghost small-btn" type="button" onClick={() => createPage(page.id)}>＋ Sub-page</button>
              <button className="btn danger ghost small-btn" type="button" aria-label="Delete page" onClick={async () => {
                if (!window.confirm("Delete this page and its sub-pages?")) return;
                await api(`/api/notes/${page.id}`, { method: "DELETE" }).catch(() => {});
                setOpenId(null);
                loadList();
              }}>🗑</button>
            </div>
            <RichTextEditor
              value={page.body}
              rows={16}
              placeholder="Start writing… type / for blocks (headings, checklists, callouts, math)"
              onChange={(v) => { markDirty(); setPage({ ...page, body: v }); }}
            />
            <details style={{ marginTop: 14 }}>
              <summary className="muted small">Preview as readers see it</summary>
              <div className="panel" style={{ marginTop: 8 }}>
                <RichText text={page.body} />
              </div>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

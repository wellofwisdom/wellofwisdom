// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import { api, niceError } from "../../../api";
import type { ItemNode, Submission } from "../../../types";
import { RichText } from "../../../lib/rich";

const OUTCOME_LABEL: Record<string, string> = {
  not_yet: "not yet",
  nearly: "nearly there",
  met: "met",
  exceptional: "exceptional",
};

export default function ProjectItem({ item, submission, onSubmission }: {
  item: ItemNode;
  submission: Submission | null;
  onSubmission: (sub: Submission) => void;
}) {
  const c = item.content || {};
  const [text, setText] = useState(submission ? submission.body : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const status = submission ? submission.status : "draft";
  const frozen = status === "submitted";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  useEffect(() => {
    if (submission) setText(submission.body);
  }, [submission?.item_id, submission?.status]);

  const fresh = Boolean(submission && submission.feedback && submission.unseen);
  useEffect(() => {
    if (fresh) api(`/api/learn/submissions/${item.id}/seen`, { method: "POST" }).catch(() => {});
  }, [fresh, item.id]);

  async function save(submit: boolean) {
    setBusy(true);
    setMsg("");
    try {
      const d = await api<{ submission: Submission }>(`/api/learn/submissions/${item.id}`, {
        method: "PUT",
        body: { body: text, submit },
      });
      onSubmission(d.submission);
      setMsg(submit ? "Handed in." : "Saved. Come back to it whenever you like.");
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="litem project">
      <h2>Project: {c.title}</h2>
      <RichText text={c.description || ""} />
      {c.rubric && (
        <details style={{ marginTop: 8 }} open={!frozen && status === "draft"}>
          <summary className="muted small">What makes it good</summary>
          <RichText text={c.rubric} />
        </details>
      )}
      {submission && submission.feedback && (
        <div className="feedback selfcheck" role="status" style={{ marginTop: 14 }}>
          {fresh && <span className="tag" style={{ marginBottom: 6 }}>New</span>}{" "}
          <strong>From your guide{submission.outcome ? `: ${OUTCOME_LABEL[submission.outcome] || submission.outcome}` : ""}</strong>
          <RichText text={submission.feedback} />
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <label className="muted small" htmlFor={`sub-${item.id}`}>
          {frozen ? "What you handed in" : "Your write up"}
        </label>
        <textarea id={`sub-${item.id}`} className="input" rows={8} value={text} readOnly={frozen} placeholder="Describe what you made, how you made it, and what you would do differently." onChange={(e) => setText(e.target.value)} style={{ marginTop: 4 }} />
        <div className="row" style={{ marginTop: 8, alignItems: "center", gap: 10 }}>
          {frozen ? (
            <span className="tag">Handed in. Waiting for your guide.</span>
          ) : (
            <>
              <button className="btn" type="button" data-nav disabled={busy} onClick={() => save(false)}>Save draft</button>
              <button className="btn primary" type="button" data-nav disabled={busy || !text.trim()} onClick={() => save(true)}>{status === "returned" ? "Hand in again" : "Hand it in"}</button>
            </>
          )}
          <span className="grow" />
          <span className="muted small">{words} {words === 1 ? "word" : "words"}</span>
        </div>
        {msg && <p className="small" role="status" style={{ marginTop: 6 }}>{msg}</p>}
      </div>
    </section>
  );
}

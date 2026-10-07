// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useState } from "react";
import { api, niceError } from "../../../api";
import { useT, type TranslationKey } from "../../../i18n";
import type { ItemNode, Submission } from "../../../types";
import { RichText } from "../../../lib/rich";

const OUTCOME_KEY: Record<string, TranslationKey> = {
  not_yet: "project.outcomeNotYet",
  nearly: "project.outcomeNearly",
  met: "project.outcomeMet",
  exceptional: "project.outcomeExceptional",
};

export default function ProjectItem({ item, submission, onSubmission }: {
  item: ItemNode;
  submission: Submission | null;
  onSubmission: (sub: Submission) => void;
}) {
  const c = item.content || {};
  const { t } = useT();
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
      setMsg(submit ? t("project.handedIn") : t("project.savedDraft"));
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="litem project">
      <h2>{t("project.titlePrefix", { title: c.title || "" })}</h2>
      <RichText text={c.description || ""} />
      {c.rubric && (
        <details style={{ marginTop: 8 }} open={!frozen && status === "draft"}>
          <summary className="muted small">{t("project.rubricSummary")}</summary>
          <RichText text={c.rubric} />
        </details>
      )}
      {submission && submission.feedback && (
        <div className="feedback selfcheck" role="status" style={{ marginTop: 14 }}>
          {fresh && <span className="tag" style={{ marginBottom: 6 }}>{t("project.new")}</span>}{" "}
          <strong>{submission.outcome
            ? t("project.fromGuideOutcome", { outcome: t(OUTCOME_KEY[submission.outcome] || "project.outcomeMet") })
            : t("project.fromGuide")}</strong>
          <RichText text={submission.feedback} />
        </div>
      )}
      <div style={{ marginTop: 14 }}>
        <label className="muted small" htmlFor={`sub-${item.id}`}>
          {frozen ? t("project.whatYouHandedIn") : t("project.yourWriteUp")}
        </label>
        <textarea id={`sub-${item.id}`} className="input" rows={8} value={text} readOnly={frozen} placeholder={t("project.placeholder")} onChange={(e) => setText(e.target.value)} style={{ marginTop: 4 }} />
        <div className="row" style={{ marginTop: 8, alignItems: "center", gap: 10 }}>
          {frozen ? (
            <span className="tag">{t("project.handedInWaiting")}</span>
          ) : (
            <>
              <button className="btn" type="button" data-nav disabled={busy} onClick={() => save(false)}>{t("project.saveDraft")}</button>
              <button className="btn primary" type="button" data-nav disabled={busy || !text.trim()} onClick={() => save(true)}>{status === "returned" ? t("project.handInAgain") : t("project.handItIn")}</button>
            </>
          )}
          <span className="grow" />
          <span className="muted small">{words} {t(words === 1 ? "project.word" : "project.words")}</span>
        </div>
        {msg && <p className="small" role="status" style={{ marginTop: 6 }}>{msg}</p>}
      </div>
    </section>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Side panel showing one lesson as a learner sees it. Read only, same player
// components, no session switch. Preview data is already stripped by the server.

import { useEffect, useState } from "react";
import { api, niceError } from "../../api";
import type { ItemNode } from "../../types";
import { RichText } from "../../lib/rich";
import { VideoPlayer } from "../VideoUI";
import ArticleItem from "../../pages/learn/items/ArticleItem";
import AudioItem from "../../pages/learn/items/AudioItem";

type PreviewLesson = {
  id: number;
  course_id: number;
  course_title: string;
  title: string;
  summary: string | null;
  items: ItemNode[];
};

function PreviewExercise({ item }: { item: ItemNode }) {
  const c = item.content || {};
  const kind = String(c.kind || "mcq");
  const choices = Array.isArray(c.choices) ? c.choices : [];
  return (
    <section className="litem exercise">
      <div className="exhead">{String(c.prompt || "")}</div>
      {kind === "mcq" && choices.length > 0 && (
        <div className="choices" aria-label="Multiple choice preview">
          {choices.map((ch: { id: string; text: string }) => (
            <div key={ch.id} className="choice">
              {String(ch.text)}
            </div>
          ))}
        </div>
      )}
      {kind === "numeric" && <div className="muted small">Answer with a number.</div>}
      {kind === "text" && <div className="muted small">Written answer, self checked.</div>}
    </section>
  );
}

function PreviewVideo({ item }: { item: ItemNode }) {
  const c = item.content || {};
  return (
    <section className="litem">
      <h3 style={{ margin: "0 0 6px" }}>{c.title || "Video"}</h3>
      {c.note && <p className="muted small">{c.note}</p>}
      <VideoPlayer content={{ youtubeId: c.youtubeId, uploadId: c.uploadId, vimeoId: c.vimeoId, fileUrl: c.fileUrl, peertubeHost: c.peertubeHost, peertubeId: c.peertubeId, title: c.title }} />
      {Array.isArray(c.questions) && c.questions.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {c.questions.map((q: { prompt: string; choices: { id: string; text: string }[] }, idx: number) => (
            <div key={idx} className="litem exercise" style={{ marginTop: 8 }}>
              <div className="exhead">{q.prompt}</div>
              <div className="choices">
                {(q.choices || []).map((ch) => (
                  <div key={ch.id} className="choice">
                    {String(ch.text)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PreviewItem({ item }: { item: ItemNode }) {
  if (item.type === "article") return <ArticleItem item={item} />;
  if (item.type === "video") return <PreviewVideo item={item} />;
  if (item.type === "audio") return <AudioItem item={item} />;
  if (item.type === "exercise") return <PreviewExercise item={item} />;
  if (item.type === "project") {
    const c = item.content || {};
    return (
      <section className="litem project">
        <h3>Project: {c.title}</h3>
        <RichText text={c.description || ""} />
        {c.rubric && <details><summary className="muted small">What makes it good</summary><RichText text={c.rubric} /></details>}
      </section>
    );
  }
  return null;
}

export default function LessonPreview({ lessonId, onClose }: { lessonId: number; onClose: () => void }) {
  const [lesson, setLesson] = useState<PreviewLesson | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr("");
    setLesson(null);
    api<{ lesson: PreviewLesson }>(`/api/courses/lessons/${lessonId}/preview`)
      .then((d) => setLesson(d.lesson))
      .catch((e) => setErr(niceError(e)));
  }, [lessonId]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Lesson preview" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: "85vh", overflow: "auto" }}>
        <div className="mhead">
          <h2>{lesson ? lesson.title : "Preview"}</h2>
          <button className="iconbtn" type="button" aria-label="Close preview" onClick={onClose}>x</button>
        </div>
        {!lesson && !err && <div className="skel" style={{ height: 120 }} />}
        {err && <div className="formerror" role="alert">{err}</div>}
        {lesson && (
          <>
            {lesson.summary && <p className="muted" style={{ marginBottom: 12 }}>{lesson.summary}</p>}
            <p className="muted small" style={{ marginBottom: 12 }}>As the learner sees it. Answers are hidden.</p>
            {lesson.items.map((item) => (
              <PreviewItem key={item.id} item={item} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

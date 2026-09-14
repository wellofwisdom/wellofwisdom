// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useRef } from "react";
import type { ItemNode } from "../../../types";
import { VideoPlayer } from "../../../components/VideoUI";
import ExerciseItem from "./ExerciseItem";

const REWIND_SEC = 10;

export default function VideoItem({ item, solved, onSolved }: {
  item: ItemNode; solved: Record<string, boolean>; onSolved: (key: string, correct: boolean | null) => void;
}) {
  const c = item.content || {};
  const questions: any[] = c.questions || [];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rewind = useCallback((atSec: number, play: boolean) => {
    const el = videoRef.current;
    if (!el) return false;
    el.currentTime = Math.max(0, Math.round(atSec) - REWIND_SEC);
    if (play) el.play().catch(() => {});
    else el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return true;
  }, []);
  return (
    <section className="litem">
      <h2>Video: {c.title}</h2>
      {c.note && <p className="muted">{c.note}</p>}
      <VideoPlayer content={{ youtubeId: c.youtubeId, uploadId: c.uploadId, title: c.title }} videoRef={videoRef} />
      {questions.map((q: any, i: number) => (
        <ExerciseItem key={i} item={item} solved={solved} onSolved={onSolved} qKey={`${item.id}:${i}`} qIdx={i} question={q} rewind={rewind} />
      ))}
    </section>
  );
}

export { REWIND_SEC };

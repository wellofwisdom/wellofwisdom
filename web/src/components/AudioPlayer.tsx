// SPDX-License-Identifier: AGPL-3.0-or-later
// One audio item: a voice line or a tiny music loop. The file lives as an
// upload (/media/:id) when a guide uploaded or generated it, or as a plain
// URL when it came from a packaged course. The transcript is always kept:
// it is what a parent reads, what a caption shows, and what the browser's
// offline speech reads when no file is there yet.
import { useEffect, useMemo, useRef, useState } from "react";
import { speakWithLang, currentLang } from "../i18n";

export interface AudioContent {
  title?: string;
  transcript?: string;
  text?: string;
  body?: string;
  uploadId?: number;
  audioUrl?: string;
  url?: string;
}

function cleanText(s: string): string {
  return String(s || "")
    .replace(/\$\$?[^$]*\$\$?/g, " ")
    .replace(/[*#>`_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export function AudioPlayer({ content }: { content: AudioContent }) {
  const title = content.title || "Listen";
  const transcript = String(content.transcript || content.text || content.body || "").trim();
  const src = content.uploadId ? `/media/${content.uploadId}` : (content.audioUrl || content.url || null);

  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speakable = useMemo(() => cleanText(transcript), [transcript]);

  useEffect(() => {
    return () => {
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  function browserSpeak() {
    if (typeof speechSynthesis === "undefined" || !speakable) return;
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const lang = currentLang();
    const ok = speakWithLang(speakable, lang, { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
    if (ok) setSpeaking(true);
  }

  if (!src) {
    // No file yet: transcript + browser voice fallback. Offline, no cost.
    if (!transcript) return null;
    return (
      <div className="litem audio litem-audio" style={{ borderLeft: "3px solid var(--accent, #7c6cff)", paddingLeft: 12 }}>
        <div className="row" style={{ alignItems: "center", gap: 10 }}>
          <strong>{title}</strong>
          <button className="btn ghost small-btn" type="button" onClick={browserSpeak} aria-label={speaking ? "Stop reading aloud" : "Read this aloud"}>
            {speaking ? "⏹️ Stop" : "🔊 Listen"}
          </button>
        </div>
        <p className="muted small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{transcript}</p>
      </div>
    );
  }

  return (
    <div className="litem audio litem-audio" style={{ borderLeft: "3px solid var(--accent, #7c6cff)", paddingLeft: 12 }}>
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <strong>{title}</strong>
        <span className="muted small">(press play, or read the words)</span>
      </div>
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={src}
        style={{ width: "100%", marginTop: 8 }}
        onPlay={() => {
          if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
          setSpeaking(false);
        }}
      >
        <track kind="captions" srcLang="en" label="Captions" src={src.includes("/media/") ? `${src}/captions.vtt` : undefined as unknown as string} />
      </audio>
      <p className="muted small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{transcript}</p>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn ghost small-btn" type="button" onClick={browserSpeak} aria-label={speaking ? "Stop reading aloud" : "Read with browser voice instead"}>
          {speaking ? "⏹️ Stop voice" : "🔊 Browser voice"}
        </button>
      </div>
    </div>
  );
}

// Tiny chapter music. Low by default, muted by default, remembers choice.
// A page that never loads music until the learner opts in cannot surprise anyone.
export function ChapterMusic({ src, chapterTitle }: { src: string | null; chapterTitle?: string }) {
  const [on, setOn] = useState(false);
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const v = localStorage.getItem("wow-music-on");
    if (v === "1" && src) setOn(true);
  }, [src]);

  useEffect(() => {
    localStorage.setItem("wow-music-on", on ? "1" : "0");
  }, [on]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!on || !src) {
      el.pause();
      return;
    }
    el.volume = 0.18;
    el.loop = true;
    el.play().catch(() => {});
  }, [on, src]);

  if (!src) return null;

  return (
    <div className="row" style={{ alignItems: "center", gap: 8, marginBottom: 10 }}>
      <button className="btn ghost small-btn" type="button" onClick={() => setOn((v) => !v)} aria-pressed={on} title={on ? "Music on, click to mute" : "Music off, click to play"}>
        {on ? "🎵 Music on" : "🎵 Music off"}
      </button>
      {chapterTitle && <span className="muted small">{chapterTitle} aura</span>}
      <audio ref={ref} src={src} loop preload="none" style={{ display: "none" }} />
    </div>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// NarratorButton: one-tap listen for an encounter scene. Prefers the server
// cached TTS clip at /media/:id, falls back to browser speechSynthesis.
// No autoplay, no sound before a tap, respects muted HUD.
import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { speakWithLang, currentLang } from "../i18n";

interface Props {
  encounterId: number;
  text: string | null;
  soundOn: boolean;
}

export default function NarratorButton({ encounterId, text, soundOn }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  async function ensureUrl(): Promise<string | null> {
    if (url) return url;
    if (!text || !text.trim()) return null;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ uploadId: number; url: string; cached?: boolean }>(
        `/api/narration/for-encounter/${encounterId}`
      );
      if (r.url) {
        setUrl(r.url);
        return r.url;
      }
      return null;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("tts_not_configured") || msg.includes("no_narration")) {
        // Fall back to browser TTS, handled below.
        return null;
      }
      setError("Could not load narration.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  function speakWithBrowser() {
    if (typeof speechSynthesis === "undefined" || !text) return;
    const lang = currentLang();
    const clean = String(text).slice(0, 4000);
    const ok = speakWithLang(clean, lang, { onend: () => setPlaying(false), onerror: () => setPlaying(false) });
    if (ok) setPlaying(true);
  }

  async function toggle() {
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
      setPlaying(false);
      return;
    }
    if (!soundOn) return;
    const u = await ensureUrl();
    if (u) {
      let el = audioRef.current;
      if (!el) {
        el = document.createElement("audio");
        el.preload = "auto";
        el.onended = () => setPlaying(false);
        el.onerror = () => { setPlaying(false); setError("Could not play narration."); };
        audioRef.current = el;
      }
      el.src = u;
      try {
        await el.play();
        setPlaying(true);
        setError("");
      } catch {
        speakWithBrowser();
      }
      return;
    }
    speakWithBrowser();
  }

  if (!text || !text.trim()) return null;
  return (
    <span className="narrator">
      <button
        className="btn ghost small-btn narrator-btn"
        type="button"
        onClick={toggle}
        disabled={busy || !soundOn}
        aria-label={playing ? "Stop narration" : "Listen to this scene"}
        title={!soundOn ? "Sound is muted" : playing ? "Stop" : "Listen"}
      >
        {busy ? "…" : playing ? "⏹ Stop" : "🔊 Listen"}
      </button>
      {error && <span className="muted small" role="status" style={{ marginLeft: 8 }}>{error}</span>}
    </span>
  );
}

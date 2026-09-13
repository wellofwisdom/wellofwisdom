// SPDX-License-Identifier: AGPL-3.0-or-later
// ChapterMusic: per-chapter mood loop from Suno on kie.ai, when configured.
// One tap to load, one tap to mute, ducked under narration, low volume, never
// autoplay with sound before a tap, silent when not configured.
import { useEffect, useRef, useState } from "react";
import { api } from "../api";

interface Props {
  chapterTitle: string;
  mood?: "calm" | "tension" | "boss" | "victory";
  soundOn: boolean;
}

export default function ChapterMusic({ chapterTitle, mood, soundOn }: Props) {
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
    };
  }, []);

  useEffect(() => {
    if (!soundOn && audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setPlaying(false);
    }
  }, [soundOn]);

  async function ensureUrl(): Promise<string | null> {
    if (url) return url;
    setBusy(true);
    setError("");
    try {
      // No dedicated music route yet: use the narration route shape as a placeholder
      // and fall back to a future /api/music/loop endpoint. Today this stays as a
      // silent stub so the UI ships without a 404 per chapter.
      const r = await api<{ url: string }>(`/api/music/loop?chapter=${encodeURIComponent(chapterTitle)}&mood=${encodeURIComponent(mood || "calm")}`).catch(() => null);
      if (r && r.url) {
        setUrl(r.url);
        return r.url;
      }
      return null;
    } catch {
      setError("Music not available.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (playing) {
      if (audioRef.current) audioRef.current.pause();
      setPlaying(false);
      return;
    }
    if (!soundOn) return;
    const u = await ensureUrl();
    if (!u) return;
    let el = audioRef.current;
    if (!el) {
      el = document.createElement("audio");
      el.loop = true;
      el.volume = 0.22;
      el.preload = "auto";
      el.onplay = () => setPlaying(true);
      el.onpause = () => setPlaying(false);
      el.onerror = () => { setPlaying(false); setError("Could not play music."); };
      audioRef.current = el;
    }
    el.src = u;
    try {
      await el.play();
      setPlaying(true);
    } catch {
      setError("Could not play music.");
    }
  }

  return (
    <span className="chaptermusic">
      <button
        className="btn ghost small-btn"
        type="button"
        onClick={toggle}
        disabled={busy || !soundOn}
        aria-label={playing ? "Stop chapter music" : "Play chapter music"}
        title={!soundOn ? "Sound is muted" : playing ? "Stop music" : "Music"}
      >
        {busy ? "…" : playing ? "⏸ Music" : "🎵 Music"}
      </button>
      {error && <span className="muted small" role="status" style={{ marginLeft: 8 }}>{error}</span>}
    </span>
  );
}

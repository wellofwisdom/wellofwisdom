// SPDX-License-Identifier: AGPL-3.0-or-later
// The learner's tutor. Opens over the lesson they are stuck on, so the help is
// about this question rather than a general chat.
//
// The copy matters here. A child who is stuck is already discouraged, so the
// opener invites the specific stuck-ness ("what part is fuzzy") rather than
// asking them to formulate a question, which is its own hurdle.
//
// Voice mode: push-to-talk in, narrator voice out, text path unchanged. The
// heard words still land in the box and the Ask button still sends them; the
// narrator reads each fresh tutor reply aloud with the browser voice, never
// the server. The mute toggle is per device, in localStorage, and the HUD
// sound mute (wow-learner-sound) silences the narrator too.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../../api";
import { RichText } from "../../lib/rich";
import { useT, speakWithLang, currentLang } from "../../i18n";
import { PushToTalk } from "../../components/PushToTalk";
import TextAnswerPad from "../../components/TextAnswerPad";

interface Msg { id?: number; role: "learner" | "tutor"; content: string; refused?: boolean }

const VOICE_KEY = "wow-tutor-voice";
const SOUND_KEY = "wow-learner-sound";

function prefOn(key: string): boolean {
  try { return localStorage.getItem(key) !== "off"; } catch { return true; }
}

/** What the narrator says: the reply with its markdown taken off.
 *  speechSynthesis reads asterisks and dollar signs aloud, and a bullet
 *  dash adds nothing, so the spoken text is the plain reading of it. */
function spokenFor(text: string): string {
  return String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/^[ \t]*[-*][ \t]+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export default function TutorChat({ lessonId, itemId, onClose }:
  { lessonId?: number; itemId?: number; onClose: () => void }) {
  const { t } = useT();
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [voiceOn, setVoiceOn] = useState<boolean>(() => prefOn(VOICE_KEY));
  const [rate, setRate] = useState(1);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { threadId: id } = await api<{ threadId: number }>("/api/tutor/threads", {
          method: "POST", body: { lessonId: lessonId || null, itemId: itemId || null },
        });
        if (cancelled) return;
        setThreadId(id);
        const d = await api<{ messages: Msg[] }>(`/api/tutor/threads/${id}`);
        if (!cancelled) setMessages(d.messages || []);
      } catch (e) {
        if (!cancelled) setError(niceError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [lessonId, itemId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => { inputRef.current?.focus(); }, [threadId]);

  // The mute choice is per device. Muting also stops the sentence in flight:
  // a narrator that keeps going after the learner asked for quiet is worse
  // than one that never started.
  useEffect(() => {
    try { localStorage.setItem(VOICE_KEY, voiceOn ? "on" : "off"); } catch { /* ignore */ }
    if (!voiceOn && typeof speechSynthesis !== "undefined") {
      try { speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  }, [voiceOn]);

  // Leaving the tutor stops the narrator mid-sentence.
  useEffect(() => () => {
    if (typeof speechSynthesis !== "undefined") {
      try { speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  }, []);

  function speakReply(content: string, atRate: number) {
    if (!voiceOn || !prefOn(SOUND_KEY)) return;
    const spoken = spokenFor(content);
    if (spoken) speakWithLang(spoken, currentLang(), { rate: atRate });
  }

  async function send() {
    const clean = text.trim();
    if (!clean || !threadId || busy) return;
    setText("");
    setMessages((m) => [...m, { role: "learner", content: clean }]);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ reply: string; refused: boolean; voice?: { rate: number; lang: string } }>(
        `/api/tutor/threads/${threadId}/messages`,
        { method: "POST", body: voiceOn ? { text: clean, voice: { rate, lang: currentLang() } } : { text: clean } }
      );
      setMessages((m) => [...m, { role: "tutor", content: r.reply, refused: r.refused }]);
      // The server normalizes the voice params; speak with what it sanctioned
      // and keep them for the next exchange.
      const speakRate = r.voice && Number.isFinite(r.voice.rate) ? r.voice.rate : rate;
      setRate(speakRate);
      speakReply(r.reply, speakRate);
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="tutorwrap" role="dialog" aria-modal="true" aria-label="Ask for help">
      <div className="tutorin">
        <div className="tutorhead">
          <span aria-hidden="true">🌰</span>
          <h2>{t("tutor.title")}</h2>
          <button className="btn ghost small-btn" type="button" onClick={onClose}>{t("tutor.close")}</button>
        </div>

        <div className="tutorlog">
          {messages.length === 0 && !error && (
            <div className="tutormsg tutor">
              <RichText text={t("tutor.emptyInvite")} />
            </div>
          )}
          {messages.map((m, i) => (
            <div className={`tutormsg ${m.role}${m.refused ? " refused" : ""}`} key={m.id || i}>
              {m.role === "tutor" ? <RichText text={m.content} /> : m.content}
            </div>
          ))}
          {busy && <div className="tutormsg tutor thinking" aria-live="polite">{t("tutor.thinking")}</div>}
          <div ref={endRef} />
        </div>

        {error && <div className="formerror" role="alert">{error}</div>}

        <div className="tutorbar">
          <textarea
            ref={inputRef}
            className="input"
            rows={2}
            value={text}
            maxLength={2000}
            placeholder={t("tutor.placeholder")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            aria-label={t("tutor.yourMessageLabel")}
            data-nav
          />
          {/* Talking to the tutor, not answering a question: the heard words are
              appended so a follow up sentence does not wipe the last one. */}
          <PushToTalk kind="text" label={t("tutor.talk")} onResult={(spoken) => setText((current) => (current.trim() ? `${current.trim()} ${spoken.text}` : spoken.text))} />
          {/* Narrator out: the toggle mutes the spoken replies, per device. */}
          <button
            className="btn ghost small-btn"
            type="button"
            aria-pressed={voiceOn}
            aria-label={voiceOn ? "Mute the tutor's voice" : "Unmute the tutor's voice"}
            title={voiceOn ? "Tutor voice is on" : "Tutor voice is muted"}
            onClick={() => setVoiceOn((v) => !v)}
          >
            <span aria-hidden="true">{voiceOn ? "🔊" : "🔇"}</span>
          </button>
          <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={send}>
            {t("tutor.ask")}
          </button>
        </div>
        {/* Done here sends the message (onSubmit is send); the pad offers
            itself while this textarea holds focus. */}
        <TextAnswerPad inputRef={inputRef} value={text} onInput={setText} onSubmit={send} busy={busy} />
        <p className="hint">
          {t("tutor.guideCanRead")}
        </p>
      </div>
    </div>
  );
}

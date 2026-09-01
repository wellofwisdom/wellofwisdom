// SPDX-License-Identifier: AGPL-3.0-or-later
// The learner's tutor. Opens over the lesson they are stuck on, so the help is
// about this question rather than a general chat.
//
// The copy matters here. A child who is stuck is already discouraged, so the
// opener invites the specific stuck-ness ("what part is fuzzy") rather than
// asking them to formulate a question, which is its own hurdle.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../../api";
import { RichText } from "../../lib/rich";

interface Msg { id?: number; role: "learner" | "tutor"; content: string; refused?: boolean }

export default function TutorChat({ lessonId, itemId, onClose }:
  { lessonId?: number; itemId?: number; onClose: () => void }) {
  const [threadId, setThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  async function send() {
    const clean = text.trim();
    if (!clean || !threadId || busy) return;
    setText("");
    setMessages((m) => [...m, { role: "learner", content: clean }]);
    setBusy(true);
    setError("");
    try {
      const r = await api<{ reply: string; refused: boolean }>(
        `/api/tutor/threads/${threadId}/messages`, { method: "POST", body: { text: clean } }
      );
      setMessages((m) => [...m, { role: "tutor", content: r.reply, refused: r.refused }]);
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
          <h2>Stuck? Let's look at it together</h2>
          <button className="btn ghost small-btn" type="button" onClick={onClose}>Close</button>
        </div>

        <div className="tutorlog">
          {messages.length === 0 && !error && (
            <div className="tutormsg tutor">
              <RichText text={"Tell me what part is fuzzy. Even “I don't know where to start” is a fine place to start."} />
            </div>
          )}
          {messages.map((m, i) => (
            <div className={`tutormsg ${m.role}${m.refused ? " refused" : ""}`} key={m.id || i}>
              {m.role === "tutor" ? <RichText text={m.content} /> : m.content}
            </div>
          ))}
          {busy && <div className="tutormsg tutor thinking" aria-live="polite">thinking…</div>}
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
            placeholder="What is confusing?"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            aria-label="Your message"
          />
          <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={send}>
            Ask
          </button>
        </div>
        <p className="hint">
          Your guide can read everything here. That is on purpose.
        </p>
      </div>
    </div>
  );
}

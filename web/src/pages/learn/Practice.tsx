// SPDX-License-Identifier: AGPL-3.0-or-later
// Practice: the spaced-review session. Due exercises from every course,
// one at a time, graded instantly, scheduled by memory science.
import { useEffect, useState } from "react";
import { api, niceError } from "../../api";
import { MathText } from "../../lib/rich";
import { IconLogout } from "../../components/Icons";

interface ReviewItem {
  item_id: number;
  reps: number;
  lapses: number;
  lesson_title: string;
  course_title: string;
  course_id: number;
  content: { prompt: string; kind: string; choices?: { id: string; text: string }[] };
}

interface AttemptResponse {
  correct: boolean | null;
  reveal: { kind: string; explanation: string | null; hint: string | null; answer: string | null };
}

export default function Practice({ onNavigate, onLogout }: {
  onNavigate: (hash: string) => void;
  onLogout: () => void;
}) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [session, setSession] = useState({ done: 0, right: 0 });
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: ReviewItem[] }>("/api/learn/review")
      .then((d) => setItems(d.items))
      .catch((e) => setError(niceError(e)));
  }, []);

  if (error) return <div className="kid"><div className="kidcard"><h2>{error}</h2></div></div>;
  if (!items) return <div className="kid"><div className="skel" style={{ width: "100%", height: 140 }} /></div>;

  const finished = idx >= items.length;

  return (
    <div className="kid">
      <div className="kidtop">
        <button className="btn ghost" type="button" onClick={() => onNavigate("")}>← Home</button>
        <button className="iconbtn" onClick={onLogout} aria-label="Sign out" type="button"><IconLogout /></button>
      </div>
      <div className="hi" style={{ fontSize: 26 }}>🔁 Practice</div>
      <p className="sub">
        {items.length === 0
          ? "Nothing due right now."
          : `${items.length} exercise${items.length > 1 ? "s" : ""} ready — these came back at exactly the right time to stick.`}
      </p>

      {items.length === 0 && (
        <div className="kidcard">
          <div className="big" aria-hidden="true">🎉</div>
          <h2 style={{ margin: "8px 0 6px" }}>All caught up!</h2>
          <p className="muted">Everything you've learned is scheduled for later. Come back tomorrow — or keep going in a course.</p>
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" type="button" onClick={() => onNavigate("")}>Back home</button>
          </div>
        </div>
      )}

      {finished && items.length > 0 && (
        <div className="kidcard">
          <div className="big" aria-hidden="true">✅</div>
          <h2 style={{ margin: "8px 0 6px" }}>Session done!</h2>
          <p className="muted">
            {session.right} of {session.done} right. The ones you missed will come back today — that's the system working.
          </p>
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" type="button" onClick={() => onNavigate("")}>Back home</button>
          </div>
        </div>
      )}

      {!finished && items.length > 0 && (
        <ReviewCard
          key={items[idx].item_id}
          item={items[idx]}
          progress={`${idx + 1} / ${items.length}`}
          onAnswered={(right) => {
            setSession((s) => ({ done: s.done + 1, right: s.right + (right ? 1 : 0) }));
            setIdx(idx + 1);
          }}
        />
      )}
    </div>
  );
}

function ReviewCard({ item, progress, onAnswered }: {
  item: ReviewItem;
  progress: string;
  onAnswered: (right: boolean) => void;
}) {
  const c = item.content;
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AttemptResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function check() {
    setBusy(true);
    setErr("");
    try {
      const d = await api<AttemptResponse>("/api/learn/attempt", {
        method: "POST",
        body: { itemId: item.item_id, questionIndex: 0, answer: c.kind === "mcq" ? picked : answer },
      });
      setResult(d);
    } catch (e) {
      setErr(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lessoncard" style={{ width: "100%" }}>
      <div className="row small muted" style={{ marginBottom: 10 }}>
        <span className="chip">{item.course_title}</span>
        <span className="grow" />
        <span>{progress}</span>
      </div>

      <div className="exercise">
        <div className="exhead"><MathText text={c.prompt} /></div>

        {!result && c.kind === "mcq" && (
          <div className="choices">
            {(c.choices || []).map((ch) => (
              <button key={ch.id} type="button" className={`choice${picked === ch.id ? " picked" : ""}`}
                disabled={busy} onClick={() => setPicked(ch.id)}>
                <MathText text={ch.text} />
              </button>
            ))}
            <button className="btn primary" type="button" disabled={busy || !picked} onClick={check}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
        )}

        {!result && c.kind !== "mcq" && (
          <div className="row wrap" style={{ marginTop: 10 }}>
            <input className="input" style={{ maxWidth: 220 }} inputMode={c.kind === "numeric" ? "decimal" : "text"}
              placeholder="Your answer" value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && answer && check()} />
            <button className="btn primary" type="button" disabled={busy || !answer.trim()} onClick={check}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>
        )}

        {result && (
          <div className={`feedback ${result.correct ? "good" : "bad"}`}>
            <strong>{result.correct ? "✅ Correct!" : "❌ Not quite."}</strong>
            {result.reveal?.explanation && <p>{result.reveal.explanation}</p>}
            <div style={{ marginTop: 10 }}>
              <button className="btn primary" type="button" onClick={() => onAnswered(result.correct === true)}>
                {item.reps > 0 ? "Next →" : "Got it →"}
              </button>
            </div>
          </div>
        )}
        {err && <div className="formerror" role="alert">{err}</div>}
      </div>
    </div>
  );
}

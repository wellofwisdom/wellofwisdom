// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import { triggerRumble } from "../../lib/gamepad";
import type { ItemNode, LearnLesson, Submission } from "../../types";
import { linkProps } from "../../router";
import { useT } from "../../i18n";
import { speakWithLang, currentLang } from "../../i18n";
import { preloadKatex } from "../../lib/rich";
import ArticleItem from "./items/ArticleItem";
import ExerciseItem from "./items/ExerciseItem";
import MultiItem from "./items/MultiItem";
import OrderItem from "./items/OrderItem";
import MatchItem from "./items/MatchItem";
import CategorizeItem from "./items/CategorizeItem";
import VideoItem from "./items/VideoItem";
import ProjectItem from "./items/ProjectItem";
import AudioItem from "./items/AudioItem";
import FigureItem from "./items/FigureItem";
import StepsItem from "./items/StepsItem";
import PredictItem from "./items/PredictItem";
import FlashcardsItem from "./items/FlashcardsItem";
import ClozeItem from "./items/ClozeItem";
import NumberlineItem from "./items/NumberlineItem";
import FractionItem from "./items/FractionItem";
import HotspotItem from "./items/HotspotItem";
import PlotItem from "./items/PlotItem";
import ScenarioItem from "./items/ScenarioItem";
import VocabCardItem from "./items/VocabCardItem";
import ListenChoiceItem from "./items/ListenChoiceItem";
import ListenRepeatItem from "./items/ListenRepeatItem";

type CourseUnit = { id: number; title: string; lessons: { id: number; title: string }[] };
type CourseForUnits = { id: number; units: CourseUnit[] };

type CompanionState = { name: string; text: string } | null;

function getSoundOn(): boolean {
  try { return localStorage.getItem("wow-learner-sound") !== "off"; } catch { return true; }
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const { t } = useT();
  if (total <= 0) return null;
  const pct = Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  return (
    <div className="lesson-progress" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={total} aria-label={t("lesson.progressLabel")}>
      <div className="progressbar" style={{ flex: 1 }} aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
      <span className="muted small" aria-hidden="true">{t("lesson.progress", { done: String(done), total: String(total) })}</span>
      <span className="sr-only">{t("lesson.progress", { done: String(done), total: String(total) })}</span>
    </div>
  );
}

function ComboBadge({ count }: { count: number }) {
  const { t } = useT();
  if (count < 2) return null;
  const label = count >= 3 ? t("lesson.comboLong", { count: String(count) }) : t("lesson.combo", { count: String(count) });
  return (
    <span className="combo-badge" role="status" aria-live="polite" aria-label={label}>
      <span aria-hidden="true">{"\uD83D\uDD25"} {count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function CompanionBubble({ state, onDismiss }: { state: CompanionState; onDismiss: () => void }) {
  const { t } = useT();
  const [speaking, setSpeaking] = useState(false);
  if (!state) return null;
  const speak = () => {
    if (!getSoundOn() || !state.text) return;
    setSpeaking(true);
    speakWithLang(state.text, currentLang(), { onend: () => setSpeaking(false), onerror: () => setSpeaking(false) });
  };
  const stop = () => {
    try { speechSynthesis.cancel(); } catch {}
    setSpeaking(false);
  };
  return (
    <div className="companion-bubble" role="status" aria-live="polite">
      <div className="companion-bubble-head">
        <span className="chip" aria-hidden="true">{"\uD83D\uDCAC"}</span>
        <strong className="small">{state.name ? t("lesson.companionSays", { name: state.name }) : t("lesson.companionHelp")}</strong>
        <span className="grow" />
        <button className="iconbtn" type="button" data-nav aria-label={t("shell.close")} onClick={onDismiss}>{"\u00D7"}</button>
      </div>
      <p className="small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{state.text}</p>
      <div className="row wrap" style={{ marginTop: 8 }}>
        <button className="btn ghost small-btn" type="button" data-nav onClick={speaking ? stop : speak} disabled={!state.text}>
          {speaking ? t("narrator.stopShort") : t("narrator.listenShort")}
        </button>
      </div>
    </div>
  );
}

function WarmupBlock({
  items: warmItems,
  onReviewSolved,
  onSkip,
}: {
  items: { item_id: number; course_id: number; lesson_title: string; course_title: string; content: { prompt?: string; kind?: string; choices?: { id: string; text: string }[] } }[];
  onReviewSolved: () => void;
  onSkip: () => void;
}) {
  const { t } = useT();
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ correct: boolean | null; explanation: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const cur = warmItems[idx];
  if (!cur) return null;
  const kind = String(cur.content?.kind || "mcq");
  const prompt = String(cur.content?.prompt || "").slice(0, 800);
  const choices = Array.isArray(cur.content?.choices) ? cur.content.choices : [];

  async function submit() {
    if (busy || feedback) return;
    setBusy(true);
    try {
      const body = { itemId: cur.item_id, questionIndex: 0, answer: kind === "mcq" ? picked : answer };
      const d = await api<{ correct: boolean | null; reveal: { explanation: string | null } }>("/api/learn/attempt", { method: "POST", body });
      setFeedback({ correct: d.correct, explanation: d.reveal?.explanation || null });
      if (d.correct === true) triggerRumble("hit");
    } catch {}
    setBusy(false);
  }

  function next() {
    setFeedback(null);
    setPicked(null);
    setAnswer("");
    if (idx + 1 < warmItems.length) setIdx(idx + 1);
    else onReviewSolved();
  }

  return (
    <section className="litem warmup" aria-labelledby="warmup-title">
      <div className="exhead">
        <span id="warmup-title">{t("lesson.warmupTitle")}</span>
        <span className="chip">{idx + 1} / {warmItems.length}</span>
      </div>
      <p className="muted small">{t("lesson.warmupHint")}</p>
      <div className="warmup-card">
        <p className="small muted">{cur.course_title} {"\u00B7"} {cur.lesson_title}</p>
        <p style={{ fontWeight: 600, marginTop: 6, whiteSpace: "pre-wrap" }}>{prompt || t("exercise.yourAnswerPlaceholder")}</p>
        {!feedback && kind === "mcq" && choices.length > 0 && (
          <div className="choices" role="radiogroup" aria-label={prompt || t("lesson.warmupTitle")}>
            {choices.map((ch) => (
              <button
                key={ch.id}
                type="button"
                role="radio"
                aria-checked={picked === ch.id}
                data-nav
                className={`choice${picked === ch.id ? " picked" : ""}`}
                onClick={() => setPicked(ch.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const group = (e.currentTarget as HTMLElement).closest(".choices");
                    if (!group) return;
                    const els = Array.from(group.querySelectorAll<HTMLElement>("[data-nav]"));
                    const i = els.indexOf(e.currentTarget as HTMLElement);
                    if (i === -1) return;
                    const dir = e.key === "ArrowDown" ? 1 : -1;
                    els[(i + dir + els.length) % els.length]?.focus();
                  }
                }}
              >
                {ch.text}
              </button>
            ))}
            <button className="btn primary" type="button" data-nav disabled={!picked || busy} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
        )}
        {!feedback && kind !== "mcq" && (
          <div className="row wrap" style={{ marginTop: 8 }}>
            <input className="input" style={{ maxWidth: 260 }} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answer.trim() && submit()} aria-label={t("exercise.yourAnswerPlaceholder")} placeholder={t("exercise.yourAnswerPlaceholder")} />
            <button className="btn primary" type="button" data-nav disabled={!answer.trim() || busy} onClick={submit}>
              {busy ? t("exercise.checking") : t("exercise.check")}
            </button>
          </div>
        )}
        {feedback && (
          <div className={`feedback ${feedback.correct ? "good" : "bad"}`} role="status">
            <strong>{feedback.correct ? t("exercise.correct") : t("exercise.notQuite")}</strong>
            {feedback.explanation && <p>{feedback.explanation}</p>}
            <button className="btn primary" type="button" data-nav onClick={next} style={{ marginTop: 8 }}>
              {t("practice.gotIt")}
            </button>
          </div>
        )}
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn ghost" type="button" data-nav onClick={onSkip}>{t("lesson.warmupSkip")}</button>
      </div>
    </section>
  );
}

function MasteryBlock({
  unitId,
  unitTitle,
  onEarned,
}: {
  unitId: number;
  unitTitle: string;
  onEarned: () => void;
}) {
  const { t } = useT();
  const [items, setItems] = useState<{ item_id: number; content: { prompt: string; kind: string; choices?: { id: string; text: string }[] } }[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<{ correct: boolean | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const [done, setDone] = useState(false);
  useEffect(() => {
    api<{ items: { item_id: number; content: { prompt: string; kind: string; choices?: { id: string; text: string }[] } }[] }>(`/api/learn/review?unitId=${unitId}&limit=5`)
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]));
  }, [unitId]);
  if (!items) return null;
  if (items.length === 0) return null;
  const cur = items[idx];
  const passed = done && score.total > 0 && score.right / score.total >= 0.7;

  async function submitMastery() {
    if (busy || !cur) return;
    setBusy(true);
    try {
      const kind = String(cur.content.kind || "mcq");
      const body = { itemId: cur.item_id, questionIndex: 0, answer: kind === "mcq" ? picked : answer };
      const d = await api<{ correct: boolean | null }>(`/api/learn/attempt`, { method: "POST", body });
      const ok = d.correct === true;
      setFeedback({ correct: d.correct });
      setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
      if (ok) triggerRumble("hit");
    } catch {}
    setBusy(false);
  }
  function nextMastery() {
    if (!items) return;
    setFeedback(null);
    setPicked(null);
    setAnswer("");
    if (idx + 1 < items.length) setIdx(idx + 1);
    else setDone(true);
  }

  return (
    <section className="litem mastery" aria-labelledby="mastery-title">
      <div className="exhead">
        <span id="mastery-title">{t("lesson.masteryTitle")} {"\u00B7"} {unitTitle}</span>
        {!done && <span className="chip">{idx + 1} / {items.length}</span>}
      </div>
      <p className="muted small">{t("lesson.masteryHint")}</p>
      {!done && cur && !feedback && (
        <div className="warmup-card" style={{ marginTop: 8 }}>
          <p style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{cur.content.prompt}</p>
          {String(cur.content.kind) === "mcq" && Array.isArray(cur.content.choices) ? (
            <div className="choices" role="radiogroup" aria-label={cur.content.prompt}>
              {(cur.content.choices || []).map((ch) => (
                <button key={ch.id} type="button" role="radio" aria-checked={picked === ch.id} data-nav className={`choice${picked === ch.id ? " picked" : ""}`} onClick={() => setPicked(ch.id)}>{ch.text}</button>
              ))}
              <button className="btn primary" type="button" data-nav disabled={!picked || busy} onClick={submitMastery}>{busy ? t("exercise.checking") : t("exercise.check")}</button>
            </div>
          ) : (
            <div className="row wrap" style={{ marginTop: 8 }}>
              <input className="input" style={{ maxWidth: 260 }} value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answer.trim() && submitMastery()} aria-label={t("exercise.yourAnswerPlaceholder")} placeholder={t("exercise.yourAnswerPlaceholder")} />
              <button className="btn primary" type="button" data-nav disabled={!answer.trim() || busy} onClick={submitMastery}>{busy ? t("exercise.checking") : t("exercise.check")}</button>
            </div>
          )}
        </div>
      )}
      {!done && feedback && (
        <div className={`feedback ${feedback.correct ? "good" : "bad"}`}>
          <strong>{feedback.correct ? t("exercise.correct") : t("exercise.notQuite")}</strong>
          <button className="btn primary" type="button" data-nav onClick={nextMastery} style={{ marginTop: 8 }}>{t("practice.gotIt")}</button>
        </div>
      )}
      {done && (
        <div className={`feedback ${passed ? "good" : "bad"}`}>
          <strong>{passed ? t("lesson.masteryPass") : t("exercise.notQuite")} {"\u00B7"} {score.right} / {score.total}</strong>
          {passed ? (
            <p>{t("lesson.masteryStarHint")}</p>
          ) : (
            <button className="btn ghost" type="button" data-nav onClick={() => { setIdx(0); setScore({ right: 0, total: 0 }); setDone(false); setFeedback(null); setPicked(null); setAnswer(""); }} style={{ marginTop: 8 }}>{t("lesson.masteryRetry")}</button>
          )}
          {passed && <button className="btn primary" type="button" data-nav onClick={onEarned} style={{ marginTop: 8 }}>{t("practice.gotIt")}</button>}
        </div>
      )}
    </section>
  );
}

export default function LessonPlayer({ lessonId, onNavigate, onLogout }: {
  lessonId: number; onNavigate: (hash: string) => void; onLogout: () => void;
}) {
  const { t } = useT();
  const [lesson, setLesson] = useState<LearnLesson | null>(null);
  const [solved, setSolved] = useState<Record<string, boolean>>({});
  const [submissions, setSubmissions] = useState<Record<string, Submission>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [nextLesson, setNextLesson] = useState<{ id: number; title: string } | null>(null);
  const [courseUnits, setCourseUnits] = useState<CourseUnit[] | null>(null);
  const [unitId, setUnitId] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const [companion, setCompanion] = useState<CompanionState>(null);
  const [warmItems, setWarmItems] = useState<{ item_id: number; course_id: number; lesson_title: string; course_title: string; content: { prompt?: string; kind?: string; choices?: { id: string; text: string }[] } }[] | null>(null);
  const [warmDone, setWarmDone] = useState(false);
  const [showMastery, setShowMastery] = useState(false);
  const completionLogged = useRef(false);

  const load = useCallback(() =>
    api<{ lesson: LearnLesson; solved: Record<string, boolean>; submissions: Record<string, Submission> }>(`/api/learn/lessons/${lessonId}`)
      .then((d) => {
        setLesson(d.lesson);
        setSolved(d.solved || {});
        setSubmissions(d.submissions || {});
        setCombo(0);
        setCompanion(null);
        setWarmDone(false);
        setShowMastery(false);
        completionLogged.current = false;
        api<{ course: CourseForUnits }>(`/api/learn/courses/${d.lesson.course_id}`)
          .then((c) => {
            setCourseUnits(c.course.units || []);
            const flat = c.course.units.flatMap((u) => u.lessons);
            const idx = flat.findIndex((l) => l.id === lessonId);
            if (idx >= 0 && idx < flat.length - 1) setNextLesson(flat[idx + 1]);
            else setNextLesson(null);
            for (const u of c.course.units) {
              if (u.lessons.some((l) => l.id === lessonId)) {
                setUnitId(u.id);
                break;
              }
            }
          })
          .catch(() => {});
        api<{ items: { item_id: number; course_id: number; lesson_title: string; course_title: string; content: { prompt?: string; kind?: string; choices?: { id: string; text: string }[] } }[] }>(`/api/learn/review?limit=2`)
          .then((r) => {
            const list = (r.items || []).slice(0, 2);
            setWarmItems(list.length ? list : []);
          })
          .catch(() => setWarmItems([]));
      })
      .catch(() => setError("Could not load this lesson.")), [lessonId]);

  useEffect(() => {
    load();
    preloadKatex().catch(() => {});
  }, [load]);

  const onSolved = (key: string, correct: boolean | null) => {
    setSolved((prev) => {
      const next = { ...prev };
      if (correct === true) next[key] = true;
      else if (!(key in next)) next[key] = false;
      return next;
    });
    if (correct === true) {
      setCombo((c) => c + 1);
      setCompanion(null);
      if (typeof navigator !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        triggerRumble("hit");
      } else if (correct === true) {
        triggerRumble("hit");
      }
    } else if (correct === false) {
      setCombo(0);
    }
  };

  const onWrongWithFeedback = (text: string, choiceName?: string) => {
    const msg = text && text.trim() ? text.trim().slice(0, 500) : "";
    if (!msg) return;
    const who = choiceName || "";
    setCompanion({ name: who, text: msg });
    setCombo(0);
  };

  const gradableKeys = useMemo(() => {
    if (!lesson) return [];
    const keys: string[] = [];
    for (const item of lesson.items) {
      if (item.type === "exercise") keys.push(`${item.id}:0`);
      if (item.type === "video") (item.content.questions || []).forEach((_: unknown, i: number) => keys.push(`${item.id}:${i}`));
    }
    return keys;
  }, [lesson]);

  const projectIds = useMemo(
    () => (lesson ? lesson.items.filter((i) => i.type === "project").map((i) => String(i.id)) : []),
    [lesson]
  );

  const progressDone = useMemo(() => {
    const g = gradableKeys.filter((k) => solved[k]).length;
    const p = projectIds.filter((id) => submissions[id] && submissions[id].status !== "draft").length;
    return g + p;
  }, [gradableKeys, projectIds, solved, submissions]);

  const progressTotal = gradableKeys.length + projectIds.length;

  const isLastInUnit = useMemo(() => {
    if (!courseUnits || unitId == null) return false;
    const u = courseUnits.find((x) => x.id === unitId);
    if (!u || !u.lessons.length) return false;
    return u.lessons[u.lessons.length - 1]?.id === lessonId;
  }, [courseUnits, unitId, lessonId]);

  useEffect(() => {
    const gradedDone = gradableKeys.every((k) => solved[k]);
    const handedIn = projectIds.every((id) => submissions[id] && submissions[id].status !== "draft");
    if (gradableKeys.length + projectIds.length > 0 && gradedDone && handedIn) setDone(true);
  }, [solved, gradableKeys, projectIds, submissions]);

  useEffect(() => {
    if (done && lesson && !completionLogged.current) {
      completionLogged.current = true;
      api(`/api/learn/lessons/${lesson.id}/complete`, { method: "POST" }).catch(() => {});
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) triggerRumble("complete");
      else triggerRumble("complete");
      if (isLastInUnit && unitId != null) setShowMastery(true);
    }
  }, [done, lesson, isLastInUnit, unitId]);

  if (error) return <div className="kid"><div className="kidcard"><h2>{error}</h2></div></div>;
  if (!lesson) return <div className="kid"><div className="skel" style={{ width: "100%", height: 200 }} /></div>;

  const warmToShow = !warmDone && warmItems && warmItems.length > 0 ? warmItems : null;

  return (
    <div className="lessonwrap">
      <header className="lessontop">
        <button className="btn ghost" type="button" data-nav onClick={() => onNavigate(`course/${lesson.course_id}`)} aria-label={t("lesson.courseBack")}>{"\u2190"} {lesson.course_title}</button>
        <button className="btn ghost" type="button" data-nav title={t("lesson.print")} aria-label={t("lesson.print")} onClick={() => window.open(`/print/lesson/${lesson.id}`, "_blank")}>{"\uD83D\uDDBA\uFE0F"}</button>
        <span className="grow" />
        <ComboBadge count={combo} />
        <button className="iconbtn" data-nav onClick={onLogout} aria-label={t("shell.signOut")} type="button">{"\u238B"}</button>
      </header>

      <ProgressBar done={progressDone} total={progressTotal} />

      {companion && <CompanionBubble state={companion} onDismiss={() => setCompanion(null)} />}

      <div className="lessoncard">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{lesson.title}</h1>
        {lesson.summary && <p className="muted" style={{ marginBottom: 14 }}>{lesson.summary}</p>}

        {warmToShow && (
          <WarmupBlock
            items={warmToShow}
            onReviewSolved={() => setWarmDone(true)}
            onSkip={() => setWarmDone(true)}
          />
        )}
        {warmToShow && warmDone === false && <div style={{ height: 1, background: "var(--border)", margin: "14px 0 0" }} aria-hidden="true" />}

        {lesson.items.map((item) => (
          <LessonItem
            key={item.id}
            item={item}
            solved={solved}
            onSolved={onSolved}
            onWrong={onWrongWithFeedback}
            submission={submissions[String(item.id)] || null}
            onSubmission={(sub) => setSubmissions((prev) => ({ ...prev, [String(sub.item_id)]: sub }))}
          />
        ))}

        {showMastery && unitId != null && courseUnits && (
          <MasteryBlock unitId={unitId} unitTitle={courseUnits.find((u) => u.id === unitId)?.title || ""} onEarned={() => setShowMastery(false)} />
        )}

        {done && (
          <div className="complete">
            <span aria-hidden="true" style={{ fontSize: 34 }}>{"\uD83C\uDF89"}</span>
            <strong>{t("lesson.lessonComplete")}</strong>
            <span className="muted small" aria-hidden="true">{t("lesson.photoFinish")}</span>
            {nextLesson ? (
              <button className="btn primary big" type="button" data-nav onClick={() => onNavigate(`lesson/${nextLesson.id}`)}>
                {t("lesson.nextLesson", { title: nextLesson.title })}
              </button>
            ) : (
              <button className="btn primary big" type="button" data-nav onClick={() => onNavigate(`course/${lesson.course_id}`)}>
                {t("lesson.backToCourse")}
              </button>
            )}
            {nextLesson && (
              <a className="muted small" {...linkProps(`course/${lesson.course_id}`)}>{t("lesson.backToCourse")}</a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LessonItem({ item, solved, onSolved, onWrong, submission, onSubmission }: {
  item: ItemNode;
  solved: Record<string, boolean>;
  onSolved: (key: string, correct: boolean | null) => void;
  onWrong: (feedback: string, name?: string) => void;
  submission: Submission | null;
  onSubmission: (sub: Submission) => void;
}) {
  if (item.type === "article") return <ArticleItem item={item} />;
  if (item.type === "project") return <ProjectItem item={item} submission={submission} onSubmission={onSubmission} />;
  if (item.type === "video") return <VideoItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} />;
  if (item.type === "audio") return <AudioItem item={item} />;
  if ((item.type as string) === "figure") return <FigureItem item={item as unknown as never} />;
  if ((item.type as string) === "steps") return <StepsItem item={item as unknown as never} />;
  if ((item.type as string) === "predict") return <PredictItem item={item as unknown as never} />;
  if ((item.type as string) === "flashcards") return <FlashcardsItem item={item as unknown as never} />;
  const kind = (item.content as Record<string, unknown>)?.kind;
  if (kind === "hotspot") return <HotspotItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "plot") return <PlotItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "scenario") return <ScenarioItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "vocab_card") return <VocabCardItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "listen_choice") return <ListenChoiceItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "listen_repeat") return <ListenRepeatItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "multi") return <MultiItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "order") return <OrderItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "match") return <MatchItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "categorize") return <CategorizeItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "cloze") return <ClozeItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "numberline") return <NumberlineItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  if (kind === "fraction") return <FractionItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} />;
  return <ExerciseItem item={item} solved={solved} onSolved={onSolved} onWrong={onWrong} qKey={`${item.id}:0`} qIdx={0} question={null} />;
}

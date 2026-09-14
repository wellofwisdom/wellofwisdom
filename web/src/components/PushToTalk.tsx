// SPDX-License-Identifier: AGPL-3.0-or-later
// Push to talk. A learner holds the button (or the space bar) and speaks;
// the recording is transcribed by the server when a speech endpoint is
// configured, or by the browser's own recogniser when it is not.
//
// Three rules shape this control, and they matter more than the code:
//   1. The transcript is always shown back before it is used. A child must
//      never be marked wrong because a microphone misheard them.
//   2. Nothing is graded here. This fills the answer box (or picks a choice);
//      the existing Check button is still the thing that submits.
//   3. No speech path at all means no button, rather than a control that
//      fails on the first press.
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

export interface SpokenAnswer {
  /** The string for the answer box, already normalised for the answer type. */
  text: string;
  /** What the recogniser heard, filler removed, for the "Heard" line. */
  transcript: string;
  kind: "text" | "numeric" | "mcq";
  /** Zero based choice position for an mcq answer, else null. */
  choiceIndex: number | null;
  language: string | null;
  confidence: number | null;
}

type Props = {
  kind?: "text" | "numeric" | "mcq";
  choiceCount?: number;
  onResult: (answer: SpokenAnswer) => void;
  /** Shown on the button instead of "Speak", e.g. "Say your answer". */
  label?: string;
};

// The Web Speech API is not in the TypeScript DOM types: Chrome and Safari
// ship it vendor prefixed, and the shape below is all this file uses.
interface SpeechAlternative { transcript: string; confidence: number }
interface SpeechResult { isFinal: boolean; length: number; 0: SpeechAlternative }
interface SpeechEvent { resultIndex: number; results: { length: number; [index: number]: SpeechResult } }
interface SpeechErrorEvent { error?: string }
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => RecognitionLike;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/** The mime this browser will actually record, preferring opus in webm. */
function recorderOptions(): MediaRecorderOptions | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mimeType of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType };
  }
  return undefined;
}

function friendlyError(code: string | undefined, status: number): string {
  if (code === "stt_not_configured") return "Speech input is not set up on this server.";
  if (code === "stt_no_speech") return "Nothing was heard. Try again, a little closer to the microphone.";
  if (code === "stt_daily_limit" || code === "ai_daily_limit") return "Speech input has hit today's limit. Typing still works.";
  if (code === "ai_monthly_limit") return "Speech input has hit this month's spending limit. Typing still works.";
  if (code === "stt_provider_error") return "The speech service did not answer. Try again, or type it.";
  if (status === 413) return "That recording was too long. Keep it short.";
  if (status === 401) return "Your session has ended. Sign in again.";
  return "The recording could not be sent. Try again, or type it.";
}

export function PushToTalk({ kind = "text", choiceCount = 0, onResult, label }: Props) {
  const [mode, setMode] = useState<"unknown" | "server" | "browser" | "none">("unknown");
  const [phase, setPhase] = useState<"idle" | "recording" | "working" | "confirm">("idle");
  const [pending, setPending] = useState<SpokenAnswer | null>(null);
  const [live, setLive] = useState("");
  const [err, setErr] = useState("");

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const meterRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recogRef = useRef<RecognitionLike | null>(null);
  const holdingRef = useRef(false);
  const phaseRef = useRef(phase);
  const beginRef = useRef<(() => void) | null>(null);
  const endRef = useRef<(() => void) | null>(null);

  // Which mode is available: the server first, the browser next, nothing last.
  useEffect(() => {
    let alive = true;
    api<{ configured: boolean }>("/api/stt/status")
      .then((s) => { if (alive) setMode(s.configured ? "server" : recognitionCtor() ? "browser" : "none"); })
      .catch(() => { if (alive) setMode(recognitionCtor() ? "browser" : "none"); });
    return () => { alive = false; };
  }, []);

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    analyserRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    if (meterRef.current) meterRef.current.style.width = "0%";
  }, []);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recRef.current = null;
    stopMeter();
  }, [stopMeter]);

  // Everything the microphone opened is closed when this leaves the page.
  useEffect(() => () => {
    holdingRef.current = false;
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    try { recogRef.current?.abort(); } catch { /* already stopped */ }
    stopTracks();
  }, [stopTracks]);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize);
      const tick = () => {
        const node = analyserRef.current;
        if (!node) return;
        node.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const v = (samples[i] - 128) / 128;
          sum += v * v;
        }
        const level = Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
        if (meterRef.current) meterRef.current.style.width = `${Math.round(level * 100)}%`;
        rafRef.current = window.requestAnimationFrame(tick);
      };
      rafRef.current = window.requestAnimationFrame(tick);
    } catch {
      // A level meter is a nicety. Recording continues without it.
    }
  }, []);

  const send = useCallback(async (blob: Blob) => {
    setPhase("working");
    setErr("");
    try {
      const query = new URLSearchParams({ kind });
      if (kind === "mcq" && choiceCount) query.set("choices", String(choiceCount));
      const res = await fetch(`/api/stt?${query.toString()}`, {
        method: "POST",
        headers: { "content-type": blob.type || "audio/webm" },
        body: blob,
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => null)) as (Partial<SpokenAnswer> & { error?: string }) | null;
      if (!res.ok) {
        setPhase("idle");
        setErr(friendlyError(data?.error, res.status));
        return;
      }
      const text = String((data && data.text) || "").trim();
      if (!text) {
        setPhase("idle");
        setErr("Nothing was heard. Try again, a little closer to the microphone.");
        return;
      }
      setPending({
        text,
        transcript: String(data?.transcript || text),
        kind: (data?.kind as SpokenAnswer["kind"]) || kind,
        choiceIndex: typeof data?.choiceIndex === "number" ? data.choiceIndex : null,
        language: data?.language ?? null,
        confidence: typeof data?.confidence === "number" ? data.confidence : null,
      });
      setPhase("confirm");
    } catch {
      setPhase("idle");
      setErr("The recording could not be sent. Try again, or type it.");
    }
  }, [kind, choiceCount]);

  const startRecognition = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) { setMode("none"); return; }
    const recog = new Ctor();
    recog.lang = document.documentElement.lang || navigator.language || "en-US";
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 1;
    let finalText = "";
    recog.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const alternative = result[0];
        if (!alternative) continue;
        if (result.isFinal) finalText += alternative.transcript;
        else interim += alternative.transcript;
      }
      setLive(`${finalText}${interim}`.trim());
    };
    recog.onerror = (e) => {
      const code = e.error || "";
      setPhase("idle");
      setErr(code === "not-allowed" || code === "service-not-allowed"
        ? "The browser blocked the microphone. Allow it, then try again."
        : code === "no-speech"
          ? "Nothing was heard. Try again, a little closer to the microphone."
          : "The browser could not transcribe that. Try again, or type it.");
    };
    recog.onend = () => {
      const said = finalText.trim();
      if (!said) { setPhase("idle"); return; }
      // The browser has no normalizer of its own, so the heard words go into
      // the box as they are and the learner fixes anything the mic got wrong.
      setPending({ text: said, transcript: said, kind, choiceIndex: null, language: recog.lang || null, confidence: null });
      setPhase("confirm");
    };
    recogRef.current = recog;
    setLive("");
    setPhase("recording");
    try { recog.start(); } catch { setPhase("idle"); }
  }, [kind]);

  const begin = useCallback(async () => {
    if (holdingRef.current || phaseRef.current !== "idle") return;
    holdingRef.current = true;
    setErr("");
    if (mode === "browser") { startRecognition(); return; }
    if (mode !== "server") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      holdingRef.current = false;
      setErr("This browser cannot record audio.");
      return;
    }
    // getUserMedia needs a secure page; a plain http self-host has to know why.
    if (!window.isSecureContext) {
      holdingRef.current = false;
      setErr("Recording needs a secure page (https or localhost). Type the answer instead.");
      return;
    }
    setPhase("recording");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        // 16 kHz mono is what transcription wants. Left as a preference: a
        // device that cannot do it still records, just at its own rate.
        audio: { channelCount: 1, sampleRate: { ideal: 16000 }, echoCancellation: true, noiseSuppression: true },
      });
      // The learner may have let go while the permission prompt was open.
      if (!holdingRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("idle");
        return;
      }
      streamRef.current = stream;
      startMeter(stream);
      chunksRef.current = [];
      const rec = new MediaRecorder(stream, recorderOptions());
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        stopTracks();
        // Under a fifth of a second of audio is a mis-tap, not an answer.
        if (blob.size < 800) {
          setPhase("idle");
          setErr("That was too short. Hold the button while you speak.");
          return;
        }
        send(blob);
      };
      rec.onerror = () => {
        stopTracks();
        setPhase("idle");
        setErr("Recording failed. Try again, or type the answer.");
      };
      recRef.current = rec;
      rec.start(250);
    } catch (e) {
      stopTracks();
      setPhase("idle");
      const name = e instanceof DOMException ? e.name : "";
      setErr(name === "NotAllowedError" || name === "PermissionDeniedError"
        ? "The microphone was blocked. Allow it in the browser, then try again."
        : name === "NotFoundError"
          ? "No microphone was found on this device."
          : "The microphone could not be started.");
    }
  }, [mode, send, startMeter, startRecognition, stopTracks]);

  const end = useCallback(() => {
    if (!holdingRef.current) return;
    holdingRef.current = false;
    if (mode === "browser") {
      try { recogRef.current?.stop(); } catch { setPhase("idle"); }
      return;
    }
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch { stopTracks(); setPhase("idle"); }
    } else if (phaseRef.current === "recording") {
      stopTracks();
      setPhase("idle");
    }
  }, [mode, stopTracks]);

  // The space bar handler below lives on the window, outside React's render,
  // so it reads the current handlers and phase from refs.
  useEffect(() => {
    phaseRef.current = phase;
    beginRef.current = begin;
    endRef.current = end;
  }, [phase, begin, end]);

  // Hold the space bar anywhere on the page, except while typing: a learner
  // with a question on screen should not have to find the button first.
  useEffect(() => {
    if (mode === "none" || mode === "unknown") return;
    const typing = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || !el.tagName) return false;
      return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    };
    const isSpace = (e: KeyboardEvent) => e.key === " " || e.code === "Space";
    const down = (e: KeyboardEvent) => {
      if (!isSpace(e) || typing(e.target)) return;
      e.preventDefault(); // space must not scroll the page while it talks
      if (!e.repeat) beginRef.current?.();
    };
    const up = (e: KeyboardEvent) => {
      if (!isSpace(e) || typing(e.target)) return;
      e.preventDefault();
      endRef.current?.();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [mode]);

  const confirm = () => {
    if (!pending) return;
    onResult(pending);
    setPending(null);
    setLive("");
    setPhase("idle");
  };

  const discard = () => {
    setPending(null);
    setLive("");
    setErr("");
    setPhase("idle");
    btnRef.current?.focus();
  };

  if (mode === "none" || mode === "unknown") return null;

  const recording = phase === "recording";
  const held = recording || phase === "working";
  const hint = recording
    ? "Release to finish"
    : phase === "working"
      ? "Reading what you said"
      : "Hold to talk, or hold the space bar";

  return (
    <span className="sttbox" style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <button
        ref={btnRef}
        className={`btn ghost small-btn${recording ? " on" : ""}`}
        type="button"
        title={hint}
        aria-label={recording ? "Recording, release when you are done" : "Hold to speak your answer"}
        aria-pressed={recording}
        disabled={phase === "working"}
        onPointerDown={(e) => { e.preventDefault(); begin(); }}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        onBlur={end}
      >
        {recording ? "🎙️ Listening…" : phase === "working" ? "… Reading" : `🎙️ ${label || "Speak"}`}
      </button>

      {recording && (
        <span className="progressbar mini" style={{ width: 72, marginTop: 0 }} aria-hidden="true">
          <div ref={meterRef} style={{ width: "0%", transition: "none" }} />
        </span>
      )}

      {phase === "confirm" && pending && (
        <>
          <span className="muted small" role="status" aria-live="polite">Heard: “{pending.transcript}”</span>
          {kind === "mcq" && pending.choiceIndex === null && (
            <span className="muted small">That did not sound like a choice. Tap the answer you meant.</span>
          )}
          <button className="btn primary small-btn" type="button" onClick={confirm}>Use this</button>
          <button className="btn ghost small-btn" type="button" onClick={discard}>Say it again</button>
        </>
      )}

      {recording && live && <span className="muted small" aria-live="polite">{live}</span>}
      {err && <span className="formerror small" role="alert">{err}</span>}
      {!held && !err && !pending && <span className="hint">Hold to talk</span>}
    </span>
  );
}

export default PushToTalk;

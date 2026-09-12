// SPDX-License-Identifier: AGPL-3.0-or-later
// Guide's two-minute explainer: record straight from webcam/mic, no app
// install, no new endpoint. The browser's MediaRecorder produces a normal
// file (webm/mp4) that is uploaded through the same /api/uploads path as any
// other video, so quotas and streaming just work.
import { useEffect, useRef, useState } from "react";
import type { UploadRow } from "./VideoUI";

type Props = {
  onRecorded: (u: UploadRow) => void;
};

export function RecordButton({ onRecorded }: Props) {
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording" | "saving" | "denied" | "unsupported">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const cappedRef = useRef(false);

  const LIMIT_SEC = 120;

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  function startTimer() {
    setElapsed(0);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setElapsed((n) => {
        const next = n + 1;
        if (next >= LIMIT_SEC) {
          cappedRef.current = true;
          stopRecording();
        }
        return next;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
  }

  async function requestAndStart() {
    setErr("");
    if (!navigator.mediaDevices?.getUserMedia) { setPhase("unsupported"); return; }
    // Abort early when not in a secure context (getUserMedia requires https or localhost).
    if (!window.isSecureContext) {
      setErr("Recording needs a secure page (https or localhost). Upload a file instead.");
      setPhase("unsupported");
      return;
    }
    setPhase("requesting");
    cappedRef.current = false;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      });
    } catch (e) {
      const name = (e instanceof DOMException ? e.name : "");
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setPhase("denied");
        setErr("Camera or microphone was blocked. Allow it in the browser, then try again.");
      } else if (name === "NotFoundError") {
        setPhase("unsupported");
        setErr("No camera or microphone found on this device.");
      } else {
        setPhase("idle");
        setErr(e instanceof Error ? e.message : "Could not start recording.");
      }
      return;
    }
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }

    // Pick a mime the browser can actually record. Safari only does mp4;
    // Chrome prefers vp9/opus. Fall back to whatever it accepts.
    const candidates = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
      "video/mp4",
    ];
    let mime = "";
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) { mime = c; break; }
    }
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setPhase("unsupported");
      setErr("Recording is not supported in this browser. Upload a file instead.");
      return;
    }
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      stopTimer();
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      save(new Blob(chunksRef.current, { type: rec.mimeType || "video/webm" }));
    };
    rec.onerror = () => {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      stopTimer();
      setPhase("idle");
      setErr("Recording failed. Try again, or upload a file instead.");
    };
    recRef.current = rec;
    rec.start(200);
    setPhase("recording");
    startTimer();
  }

  function stopRecording() {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      try { rec.stop(); } catch {}
    } else {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      stopTimer();
      setPhase("idle");
    }
    if (!cappedRef.current) setPhase("saving");
  }

  function cancel() {
    recRef.current = null;
    chunksRef.current = [];
    stopTimer();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setPhase("idle");
    setElapsed(0);
    cappedRef.current = false;
  }

  async function save(blob: Blob) {
    setPhase("saving");
    setErr("");
    try {
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const fileName = `explainer-${new Date().toISOString().slice(0, 10)}.${ext}`;
      const up: UploadRow = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/uploads");
        xhr.setRequestHeader("Content-Type", blob.type || "video/webm");
        xhr.setRequestHeader("x-upload-name", encodeURIComponent(fileName).slice(0, 260));
        xhr.setRequestHeader("x-upload-title", encodeURIComponent("Explainer").slice(0, 200));
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).upload); } catch { reject(new Error("Bad upload response")); }
          } else {
            let msg = `Upload failed (${xhr.status})`;
            if (xhr.status === 413) msg = "That recording is too large.";
            if (xhr.status === 415) msg = "That file type isn't supported.";
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed. Check the connection."));
        xhr.send(blob);
      });
      setPhase("idle");
      setElapsed(0);
      cappedRef.current = false;
      onRecorded(up);
    } catch (e) {
      setPhase("idle");
      setErr(e instanceof Error ? e.message : "Upload failed.");
    }
  }

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  if (phase === "recording" || phase === "requesting") {
    return (
      <div className="recordbox">
        <video ref={videoRef} autoPlay muted playsInline className="recordpreview" aria-label="Camera preview" />
        <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center" }}>
          {phase === "recording" ? (
            <>
              <span className="chip on" aria-live="polite">● {mm}:{ss} / 02:00</span>
              <button className="btn primary" type="button" onClick={stopRecording}>■ Stop and save</button>
              <button className="btn ghost" type="button" onClick={cancel}>Cancel</button>
            </>
          ) : (
            <span className="muted small">Starting camera…</span>
          )}
        </div>
        {cappedRef.current && <p className="hint small" style={{ marginTop: 6 }}>Two minutes is the limit for an explainer. This one was saved automatically.</p>}
        {err && <p className="formerror small" role="alert" style={{ marginTop: 6 }}>{err}</p>}
      </div>
    );
  }

  return (
    <div>
      <button className="btn" type="button" disabled={phase === "saving"}
        onClick={requestAndStart}>
        {phase === "saving" ? "Saving…" : "🎙️ Record a 2 min explainer"}
      </button>
      {(phase === "denied" || phase === "unsupported") && err && (
        <p className="formerror small" role="alert" style={{ marginTop: 6 }}>{err}</p>
      )}
      {phase !== "denied" && phase !== "unsupported" && err && (
        <p className="formerror small" role="alert" style={{ marginTop: 6 }}>{err}</p>
      )}
      <p className="hint small" style={{ marginTop: 6 }}>
        Needs camera + mic permission and a secure page. If it is blocked, upload a file instead: same result.
      </p>
    </div>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Video: one player for both sources, and the upload panel.
//
// A course video is either a YouTube id or a file this family uploaded — a
// NotebookLM export, a recorded explainer, a boss-fight clip. Uploads stream
// from /media/<id> with byte ranges, so scrubbing works.
import { useRef, useState } from "react";
import { api, niceError } from "../api";

export interface VideoContent {
  youtubeId?: string;
  uploadId?: number;
  title?: string;
  note?: string;
}

export interface UploadRow {
  id: number;
  kind: string;
  mime: string;
  bytes: number;
  title: string | null;
  original_name: string | null;
  is_public: boolean;
  url: string;
  created_at: string;
}

export function humanBytes(n: number) {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Plays either source. Uploaded files get real controls and a download-off hint. */
export function VideoPlayer({ content, poster }: { content: VideoContent; poster?: string | null }) {
  if (content.uploadId) {
    return (
      <div className="videowrap">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={`/media/${content.uploadId}`}
          poster={poster || undefined}
          controls
          preload="metadata"
          playsInline
          title={content.title || "Course video"}
        />
      </div>
    );
  }
  if (content.youtubeId) {
    return (
      <div className="videowrap">
        <iframe
          title={content.title || "Course video"}
          loading="lazy"
          src={`https://www.youtube-nocookie.com/embed/${content.youtubeId}?rel=0`}
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }
  return null;
}

const ACCEPT = "video/mp4,video/webm,video/quicktime";

/** Upload one video file. The body IS the file — no multipart, so no parser
 *  on the server and no dependency to keep patched. */
export function VideoUploader({ onUploaded, label = "Upload a video" }:
  { onUploaded: (u: UploadRow) => void; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function send(file: File) {
    setErr("");
    setBusy(true);
    setPct(0);
    try {
      // XHR rather than fetch: it reports upload progress, and a 300 MB video
      // over a home connection needs a progress bar to feel survivable.
      const up: UploadRow = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/uploads");
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("x-upload-name", encodeURIComponent(file.name).slice(0, 260));
        xhr.setRequestHeader("x-upload-title", encodeURIComponent(file.name.replace(/\.[^.]+$/, "")).slice(0, 200));
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).upload); } catch { reject(new Error("Bad response")); }
          } else {
            let msg = `Upload failed (${xhr.status})`;
            if (xhr.status === 413) msg = "That file is too large.";
            if (xhr.status === 415) msg = "That file type isn't supported — MP4, WebM or MOV.";
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed — check the connection."));
        xhr.send(file);
      });
      onUploaded(up);
    } catch (e) {
      setErr(e instanceof Error ? e.message : niceError(e));
    } finally {
      setBusy(false);
      setPct(0);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="row wrap" style={{ alignItems: "center", gap: 10 }}>
        <label className="btn" style={{ cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
          {busy ? `Uploading… ${pct}%` : `🎬 ${label}`}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            disabled={busy}
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (f) send(f);
            }}
          />
        </label>
        {busy && (
          <progress value={pct} max={100} aria-label="Upload progress" style={{ width: 160 }} />
        )}
      </div>
      {err && <p className="formerror" role="alert" style={{ marginTop: 8 }}>{err}</p>}
      <p className="hint" style={{ marginTop: 6 }}>
        MP4, WebM or MOV. A NotebookLM video download works as-is — save it, then pick it here.
      </p>
    </div>
  );
}

/** The family's uploaded videos, with the actions a guide needs. */
export function VideoLibrary({ uploads, onPick, onDelete, pickLabel = "Use" }:
  {
    uploads: UploadRow[];
    onPick?: (u: UploadRow) => void;
    onDelete?: (u: UploadRow) => void;
    pickLabel?: string;
  }) {
  if (!uploads.length) return <p className="muted small">No videos uploaded yet.</p>;
  return (
    <div className="videolist">
      {uploads.map((u) => (
        <div className="videorow" key={u.id}>
          <video src={`/media/${u.id}`} preload="metadata" muted playsInline className="videothumb" />
          <div className="grow">
            <div className="n">{u.title || u.original_name || `Video ${u.id}`}</div>
            <div className="muted small">
              {humanBytes(u.bytes)} · {u.mime.replace("video/", "")}
              {u.is_public ? " · public" : ""}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {onPick && (
              <button className="btn ghost small-btn" type="button" onClick={() => onPick(u)}>{pickLabel}</button>
            )}
            {onDelete && (
              <button className="btn ghost small-btn" type="button" onClick={() => onDelete(u)}>Delete</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function loadVideos(): Promise<{ uploads: UploadRow[]; usage: { bytes: number; files: number } }> {
  return api<{ uploads: UploadRow[]; usage: { bytes: number; files: number } }>("/api/uploads?kind=video");
}

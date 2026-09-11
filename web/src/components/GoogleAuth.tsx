// SPDX-License-Identifier: AGPL-3.0-or-later
// Google Identity Services for Well of Wisdom guide sign in and sign up.
// One button replaces email + password friction, while keeping invite gating
// and demo login intact. Falls back to plain email when Google is not configured.
import { useEffect, useRef, useState } from "react";
import { api, niceError } from "../api";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(opts: Record<string, unknown>): void;
          renderButton(el: HTMLElement, opts: Record<string, unknown>): void;
          prompt(cb?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void;
          cancel(): void;
          disableAutoSelect(): void;
        };
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";

let gisLoading: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gis_load_failed"));
    document.head.appendChild(s);
  });
  return gisLoading;
}

export function GoogleButton({
  clientId,
  familyName,
  inviteCode,
  onAuthed,
  onError,
  label = "continue_with",
}: {
  clientId: string;
  familyName?: string;
  inviteCode?: string;
  onAuthed: () => void;
  onError: (msg: string) => void;
  label?: string;
}) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const familyRef = useRef(familyName || "");
  const inviteRef = useRef(inviteCode || "");

  useEffect(() => { familyRef.current = familyName || ""; }, [familyName]);
  useEffect(() => { inviteRef.current = inviteCode || ""; }, [inviteCode]);

  useEffect(() => {
    let cancelled = false;
    const cid = String(clientId || "").trim();
    if (!cid || !btnRef.current) return;

    loadGis()
      .then(() => {
        if (cancelled || !window.google || !btnRef.current) return;
        const target = btnRef.current!;
        target.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: cid,
          callback: async (resp: { credential?: string }) => {
            const credential = String(resp?.credential || "");
            if (!credential) { onError("Google did not return a credential. Try again."); return; }
            setBusy(true);
            try {
              await api("/api/auth/google", {
                method: "POST",
                body: {
                  credential,
                  familyName: familyRef.current || undefined,
                  inviteCode: inviteRef.current || undefined,
                },
              });
              onAuthed();
            } catch (e) {
              onError(niceError(e));
              setBusy(false);
            }
          },
          auto_select: false,
          cancel_on_tap_outside: false,
        });
        window.google.accounts.id.renderButton(target, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "rectangular",
          text: label as never,
          logo_alignment: "left",
          width: String(Math.min(360, target.clientWidth || 320)),
        });
      })
      .catch(() => {
        if (!cancelled) onError("Could not load Google sign in. Check your connection, or use email instead.");
      });

    return () => { cancelled = true; };
  }, [clientId, label, onAuthed, onError]);

  return (
    <div style={{ opacity: busy ? 0.6 : 1, pointerEvents: busy ? "none" : undefined }}>
      <div ref={btnRef} style={{ minHeight: 40, display: "flex", justifyContent: "center" }} />
      {busy && <p className="hint" style={{ textAlign: "center", marginTop: 6 }}>Signing in with Google…</p>}
    </div>
  );
}

// One Tap nudge on the marketing landing. Mount once, at most once per page load,
// and only when Google is actually configured.
export function GoogleOneTap({
  clientId,
  onAuthed,
}: {
  clientId: string;
  onAuthed: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    const cid = String(clientId || "").trim();
    if (!cid || typeof window === "undefined") return;
    // Do not nudge someone already mid-form or on a small screen (the popup clips).
    if (window.innerWidth < 680) return;

    loadGis()
      .then(() => {
        if (cancelled || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: cid,
          callback: async (resp: { credential?: string }) => {
            const credential = String(resp?.credential || "");
            if (!credential) return;
            try {
              await api("/api/auth/google", { method: "POST", body: { credential } });
              onAuthed();
            } catch {
              // One Tap failures are silent: the button remains as fallback.
            }
          },
          auto_select: false,
          itp_support: true,
        } as never);
        window.google.accounts.id.prompt((n) => {
          // Nothing to do. The prompt is informational only.
          void n;
        });
      })
      .catch(() => {});

    return () => { cancelled = true; try { window.google?.accounts.id.cancel(); } catch {} };
  }, [clientId, onAuthed]);

  return null;
}

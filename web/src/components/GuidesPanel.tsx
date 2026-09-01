// SPDX-License-Identifier: AGPL-3.0-or-later
// Who else can sign in as a grown-up here, and how a new one gets in.
//
// The invite link is shown exactly once, because only its hash is stored. The
// copy says so plainly rather than letting someone close the dialog and come
// back for it later.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel } from "./ui";

interface Guide {
  id: number;
  name: string;
  email: string | null;
  guide_role: string;
  learner_ids: number[];
  is_you: boolean;
}

interface Role { id: string; label: string; blurb: string }

interface Invite {
  id: number;
  guide_role: string;
  note: string | null;
  expires_at: string;
}

export default function GuidesPanel({ learners }: { learners: { id: number; name: string }[] }) {
  const [guides, setGuides] = useState<Guide[] | null>(null);
  const [you, setYou] = useState<{ id: number; guideRole: string } | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [fresh, setFresh] = useState<{ token: string; role: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [g, r] = await Promise.all([
        api<{ guides: Guide[]; you: { id: number; guideRole: string } }>("/api/guides"),
        api<{ roles: Role[] }>("/api/guides/roles"),
      ]);
      setGuides(g.guides);
      setYou(g.you);
      setRoles(r.roles);
      // Only an owner may list invites; a 403 here is expected, not an error.
      const i = await api<{ invites: Invite[] }>("/api/guides/invites").catch(() => ({ invites: [] }));
      setInvites(i.invites);
    } catch (e) {
      setMsg(niceError(e));
      setGuides([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isOwner = you?.guideRole === "owner";

  async function changeRole(g: Guide, role: string) {
    setMsg("");
    try {
      await api(`/api/guides/${g.id}/role`, { method: "PUT", body: { role } });
      setMsg(`✓ ${g.name} is now a ${role}.`);
      await load();
    } catch (e) {
      const m = niceError(e);
      setMsg(m.includes("last_owner")
        ? "That is the only owner. Make someone else an owner first."
        : m);
      await load();
    }
  }

  async function setAssigned(g: Guide, learnerId: number, on: boolean) {
    const next = on
      ? [...g.learner_ids, learnerId]
      : g.learner_ids.filter((x) => x !== learnerId);
    try {
      await api(`/api/guides/${g.id}/learners`, { method: "PUT", body: { learnerIds: next } });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  async function remove(g: Guide) {
    if (!window.confirm(`Remove ${g.name}? They lose access immediately. Their learners and work stay.`)) return;
    try {
      await api(`/api/guides/${g.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      const m = niceError(e);
      setMsg(m.includes("last_owner") ? "You cannot remove the only owner."
        : m.includes("cannot_remove_yourself") ? "You cannot remove yourself."
        : m);
    }
  }

  async function invite(role: string, learnerIds: number[]) {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ token: string }>("/api/guides/invites", {
        method: "POST", body: { role, days: 7, learnerIds },
      });
      setFresh({ token: r.token, role });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(i: Invite) {
    await api(`/api/guides/invites/${i.id}`, { method: "DELETE" }).catch(() => {});
    await load();
  }

  if (!guides) return null;

  return (
    <Panel title="Grown-ups" side={`${guides.length}`}>
      {guides.map((g) => (
        <div key={g.id}>
          <div className="checkitem">
            <span className="t">
              <b>{g.name}</b>{g.is_you ? <span className="muted"> (you)</span> : null}
              {g.email && <div className="muted small">{g.email}</div>}
            </span>
            {isOwner && !g.is_you ? (
              <select
                className="input"
                style={{ maxWidth: 150 }}
                value={g.guide_role}
                onChange={(e) => changeRole(g, e.target.value)}
                aria-label={`Role for ${g.name}`}
              >
                {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            ) : (
              <span className="tag">{(roles.find((r) => r.id === g.guide_role) || {}).label || g.guide_role}</span>
            )}
            {isOwner && !g.is_you && (
              <button className="btn ghost small-btn" type="button" onClick={() => remove(g)}>Remove</button>
            )}
          </div>

          {g.guide_role === "assistant" && (
            <div style={{ margin: "0 0 10px 14px" }}>
              <div className="hint">Sees only these learners:</div>
              <div className="row wrap" style={{ gap: 8 }}>
                {learners.map((l) => (
                  <label key={l.id} className="tag" style={{ cursor: isOwner ? "pointer" : "default" }}>
                    <input
                      type="checkbox"
                      disabled={!isOwner}
                      checked={g.learner_ids.includes(l.id)}
                      onChange={(e) => setAssigned(g, l.id, e.target.checked)}
                    />{" "}
                    {l.name}
                  </label>
                ))}
                {learners.length === 0 && <span className="muted small">No learners yet.</span>}
              </div>
              {g.learner_ids.length === 0 && (
                <div className="hint" style={{ color: "var(--warn)" }}>
                  Assigned to nobody, so they can see nothing yet.
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {isOwner && (
        <div style={{ marginTop: 14 }}>
          <h4>Invite someone</h4>
          <p className="muted small">
            A single-use link that expires in 7 days. You will see it once.
          </p>
          <div className="row wrap">
            {roles.filter((r) => r.id !== "owner").map((r) => (
              <button className="btn" type="button" key={r.id} disabled={busy}
                onClick={() => invite(r.id, [])} title={r.blurb}>
                ＋ {r.label}
              </button>
            ))}
          </div>
          {roles.filter((r) => r.id !== "owner").map((r) => (
            <p className="hint" key={r.id}><b>{r.label}:</b> {r.blurb}</p>
          ))}
        </div>
      )}

      {fresh && (
        <div className="card" style={{ borderColor: "var(--accent)" }}>
          <h4 style={{ marginTop: 0 }}>Send this link. It is shown once.</h4>
          <input
            className="input"
            readOnly
            value={`${window.location.origin}/join/${fresh.token}`}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Invite link"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" type="button" onClick={() => {
              navigator.clipboard?.writeText(`${window.location.origin}/join/${fresh.token}`);
              setMsg("Link copied.");
            }}>Copy link</button>
            <div className="grow" />
            <button className="btn ghost" type="button" onClick={() => setFresh(null)}>Done</button>
          </div>
          <p className="hint">
            Only a hash is stored, so this cannot be shown again. Revoke and make a new one if it is lost.
          </p>
        </div>
      )}

      {invites.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4>Waiting to be used</h4>
          {invites.map((i) => (
            <div className="checkitem" key={i.id}>
              <span className="t">
                {(roles.find((r) => r.id === i.guide_role) || {}).label || i.guide_role}
                <span className="muted small"> · expires {String(i.expires_at).slice(0, 10)}</span>
              </span>
              <button className="btn ghost small-btn" type="button" onClick={() => revoke(i)}>Revoke</button>
            </div>
          ))}
        </div>
      )}

      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}
    </Panel>
  );
}

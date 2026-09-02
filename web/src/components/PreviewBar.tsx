// SPDX-License-Identifier: AGPL-3.0-or-later
// The banner that says you are not yourself right now.
//
// The failure mode this prevents is a guide forgetting they are in preview,
// wondering why nothing saves, and concluding the app is broken. So it is
// loud, fixed to the top, states whose view this is, says plainly that
// nothing is recorded, and the way out is always one click away.
import { getPreviewLearner, setPreviewLearner } from "../api";

export function startPreview(learnerId: number, learnerName: string) {
  setPreviewLearner(learnerId);
  try {
    sessionStorage.setItem("wow-preview", JSON.stringify({ id: learnerId, name: learnerName }));
  } catch {
    /* private mode: preview still works, it just will not survive a reload */
  }
  window.location.assign("/");
}

export function endPreview() {
  setPreviewLearner(null);
  try {
    sessionStorage.removeItem("wow-preview");
  } catch {
    /* nothing to clean up */
  }
  window.location.assign("/");
}

/** Restore preview across a reload, since the learner app navigates. */
export function restorePreview(): { id: number; name: string } | null {
  try {
    const raw = sessionStorage.getItem("wow-preview");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Number(parsed.id)) return null;
    setPreviewLearner(Number(parsed.id));
    return { id: Number(parsed.id), name: String(parsed.name || "your learner") };
  } catch {
    return null;
  }
}

export default function PreviewBar({ name }: { name: string }) {
  if (!getPreviewLearner()) return null;
  return (
    <div className="previewbar" role="status">
      <span className="pvdot" aria-hidden="true" />
      <span className="grow">
        Viewing as <b>{name}</b>. Nothing here is recorded: no answers, no XP, no streak.
      </span>
      <button className="btn" type="button" onClick={endPreview}>Back to my view</button>
    </div>
  );
}

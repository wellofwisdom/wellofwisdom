// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from "react";
import { useT } from "../../../i18n";

function collectHints(content: Record<string, unknown>): string[] {
  const hintsRaw = (content as { hints?: unknown }).hints;
  const hintRaw = (content as { hint?: unknown }).hint;
  if (Array.isArray(hintsRaw)) {
    const arr = hintsRaw
      .map((v) => String(v ?? "").trim())
      .filter(Boolean)
      .slice(0, 3);
    if (arr.length) return arr;
  }
  const single = String(hintRaw ?? "").trim();
  if (single) return [single];
  return [];
}

export function getHintList(content: Record<string, unknown>): string[] {
  return collectHints(content);
}

export default function HintLadder({ content }: { content: Record<string, unknown> }) {
  const { t } = useT();
  const hints = collectHints(content);
  const [shown, setShown] = useState(0);
  if (hints.length === 0) return null;
  const visible = hints.slice(0, shown);
  const remaining = hints.length - shown;
  const hasMore = remaining > 0;
  return (
    <div className="hintladder">
      {visible.length > 0 && (
        <div role="status" aria-live="polite" aria-atomic="false">
          {visible.map((h, i) => (
            <p key={i} className="hintbox">
              <span className="muted small" aria-hidden="true">
                {t("exercise.hintLabel", { num: String(i + 1) })}:{" "}
              </span>
              {h}
            </p>
          ))}
        </div>
      )}
      {hasMore ? (
        <button
          className="btn ghost small-btn"
          type="button"
          data-nav
          aria-label={shown === 0 ? t("exercise.showHint") : t("exercise.showNextHint")}
          onClick={() => setShown((n) => Math.min(hints.length, n + 1))}
        >
          {shown === 0
            ? t("exercise.showHint")
            : t("exercise.showNextHint")}{" "}
          <span className="muted small" aria-hidden="true">
            ({t("exercise.hintWithCount", { current: String(shown + 1), total: String(hints.length) })})
          </span>
        </button>
      ) : (
        <span className="muted small" aria-hidden="true">
          {visible.length > 0 ? t("exercise.noMoreHints") : null}
        </span>
      )}
    </div>
  );
}

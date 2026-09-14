// SPDX-License-Identifier: AGPL-3.0-or-later
// QuestLog: the learner's todo made playable. Reuses what LearnerApp already
// fetches: upcoming events/milestones, returned work, reviewsDue, and the
// course path's next lesson. No new API, just a different frame.
import { useT } from "../../i18n";
interface Props {
  upcoming: { label: string; date: string }[] | null;
  returned: { item_id: number; lesson_id: number; title: string; course_title: string; outcome: string | null }[] | null;
  reviewsDue: number | null;
  onNavigate: (route: string) => void;
}

export default function QuestLog({ upcoming, returned, reviewsDue, onNavigate }: Props) {
  const { t } = useT();
  const hasReturned = returned && returned.length > 0;
  const hasReviews = reviewsDue != null && reviewsDue > 0;
  const hasUpcoming = upcoming && upcoming.length > 0;
  if (!hasReturned && !hasReviews && !hasUpcoming) return null;
  return (
    <div className="questlog" role="region" aria-label="Quests">
      <h2 className="questlog-title">{t("quests.title")}</h2>
      {hasReturned && (
        <div className="questlog-group">
          <h3 className="questlog-group-title">{t("quests.messages")}</h3>
          {returned!.slice(0, 3).map((w) => (
            <button key={w.item_id} type="button" data-nav data-say={`${w.title} from ${w.course_title}`} className="questcard quest-returned" onClick={() => onNavigate(`lesson/${w.lesson_id}`)}>
              <span className="questcard-icon" aria-hidden="true">💬</span>
              <span className="questcard-body">
                <span className="questcard-title">"{w.title}"</span>
                <span className="questcard-sub">{w.course_title}{w.outcome ? ` · ${w.outcome}` : ""}</span>
              </span>
              <span className="questcard-go" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      )}
      {hasReviews && (
        <div className="questlog-group">
          <h3 className="questlog-group-title">{t("quests.sideQuest")}</h3>
            <button type="button" data-nav data-say={`Practice ${reviewsDue} due`} className="questcard quest-practice" onClick={() => onNavigate("practice")}>
            <span className="questcard-icon" aria-hidden="true">🔁</span>
            <span className="questcard-body">
              <span className="questcard-title">{t("quests.practiceDue", { count: String(reviewsDue) })}</span>
              <span className="questcard-sub">{t("quests.quickReview")}</span>
            </span>
            <span className="questcard-go" aria-hidden="true">→</span>
          </button>
        </div>
      )}
      {hasUpcoming && (
        <div className="questlog-group">
          <h3 className="questlog-group-title">{t("quests.comingUp")}</h3>
          <div className="questlog-upcoming">
            {(upcoming || []).slice(0, 4).map((u, i) => (
              <div key={i} className="quest-uprow">
                <span className="quest-up-date">{u.date.slice(5)}</span>
                <span className="quest-up-label">{u.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// SPDX-License-Identifier: AGPL-3.0-or-later
// Learners list: clean cards that link to the full profile page.
import { useNavigate, linkProps } from "../router";
import type { MeResponse } from "../types";
import { Panel, EmptyState } from "../components/ui";
import { startPreview } from "../components/PreviewBar";

export default function Learners({ me }: { me: MeResponse }) {
  const navigate = useNavigate();
  const learners = me.learners || [];

  return (
    <>
      <Panel
        title="Your learners"
        side={
          <button className="btn primary" type="button" onClick={() => navigate("learners/new")}>
            ＋ Add learner
          </button>
        }
      >
        {learners.length === 0 ? (
          <EmptyState
            icon="🧑‍🎓"
            title="No learners yet"
            message="Add each person who's learning. They sign in with a username and PIN. No email needed unless they want notifications."
            action={
              <button className="btn primary big" type="button" onClick={() => navigate("learners/new")}>
                ＋ Add your first learner
              </button>
            }
          />
        ) : (
          learners.map((l) => (
            <div
              key={l.id}
              className="learnerrow coursecard"
              style={{ cursor: "pointer" }}
              // Mouse convenience only: the real, accessible link is the name.
              // A stray click elsewhere on the card still opens the profile, but
              // the keyboard and a screen reader follow the anchor, not the div.
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button")) return;
                navigate(`learners/${l.id}`);
              }}
            >
              <span className="avatar" aria-hidden="true">{l.name.slice(0, 1).toUpperCase()}</span>
              <div className="meta">
                <div className="n">
                  <a {...linkProps(`learners/${l.id}`)} className="cardlink">{l.name}</a>
                </div>
                <div className="u">
                  @{l.username}{l.grade_level ? ` · Grade ${l.grade_level}` : ""}
                  {l.ai_notes ? " · 🧠" : ""}{l.email ? " · 📧" : ""}
                </div>
              </div>
              <button
                className="btn ghost small-btn"
                type="button"
                onClick={(e) => { e.stopPropagation(); startPreview(l.id, l.name); }}
                title={`See the app exactly as ${l.name} sees it. Nothing is recorded.`}
              >
                👀 View as
              </button>
              <div className="chips">
                {l.interests.slice(0, 3).map((i) => (
                  <span className="tag" key={i}>{i}</span>
                ))}
                {l.interests.length > 3 && <span className="tag">+{l.interests.length - 3}</span>}
              </div>
            </div>
          ))
        )}
      </Panel>

      <Panel title="How learners sign in" side="simple by design">
        <p className="muted small">
          Learners use the family code <code className="k">{me.user?.joinCode}</code>, their username, and their PIN.
          No email required. Login stays the same even if you add one for notifications.
        </p>
      </Panel>
    </>
  );
}

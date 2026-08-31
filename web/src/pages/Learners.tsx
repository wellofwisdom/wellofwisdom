// SPDX-License-Identifier: AGPL-3.0-or-later
// Learners list — clean cards that link to the full profile page.
import { useNavigate } from "../router";
import type { MeResponse } from "../types";
import { Panel, EmptyState } from "../components/ui";

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
            message="Add each person who's learning. They sign in with a username and PIN — no email needed unless they want notifications."
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
              onClick={() => navigate(`learners/${l.id}`)}
              onKeyDown={(e) => e.key === "Enter" && navigate(`learners/${l.id}`)}
              tabIndex={0}
              role="link"
              aria-label={`Edit ${l.name}`}
            >
              <span className="avatar" aria-hidden="true">{l.name.slice(0, 1).toUpperCase()}</span>
              <div className="meta">
                <div className="n">{l.name}</div>
                <div className="u">
                  @{l.username}{l.grade_level ? ` · Grade ${l.grade_level}` : ""}
                  {l.ai_notes ? " · 🧠" : ""}{l.email ? " · 📧" : ""}
                </div>
              </div>
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

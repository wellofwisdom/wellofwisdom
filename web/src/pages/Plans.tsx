// SPDX-License-Identifier: AGPL-3.0-or-later
// Learning Paths: long-term plans (semester/year). List + wizard entry.
import { useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel, EmptyState } from "../components/ui";
import { IconSparkle } from "../components/Icons";
import { linkProps } from "../router";

interface PlanRow {
  id: number;
  title: string;
  subject: string;
  status: string;
  start_date: string;
  end_date: string;
  sessions_per_week: number;
  minutes_per_session: number;
  milestone_count: number;
  courses_made: number;
  learners: string | null;
}

export default function Plans({ onNavigate }: { onNavigate: (hash: string) => void }) {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ plans: PlanRow[] }>("/api/plans")
      .then((d) => setPlans(d.plans))
      .catch((e) => setError(niceError(e)));
  }, []);

  return (
    <Panel
      title="Learning paths"
      side={
        <button className="btn primary" type="button" onClick={() => onNavigate("plans/new")}>
          <IconSparkle /> New path
        </button>
      }
    >
      {error && <div className="formerror" role="alert">{error}</div>}
      {!plans ? (
        <div className="skel" style={{ height: 80 }} />
      ) : plans.length === 0 ? (
        <EmptyState
          icon="🗺️"
          title="Plan a whole semester or year"
          message="A learning path maps the journey (milestones, projects, resources) for a subject over months. Courses are generated for each milestone at the right time, personalized per learner. An AI assistant walks you through setting it up."
          action={
            <button className="btn primary big" type="button" onClick={() => onNavigate("plans/new")}>
              <IconSparkle /> Start with the AI assistant
            </button>
          }
        />
      ) : (
        plans.map((p) => {
          const weeks = Math.max(1, Math.round((new Date(p.end_date).getTime() - new Date(p.start_date).getTime()) / (7 * 86400000)));
          const hours = Math.round((weeks * p.sessions_per_week * p.minutes_per_session) / 60);
          return (
            <div key={p.id} className="learnerrow coursecard" style={{ cursor: "pointer" }}
              // Mouse convenience; the real, accessible link is the title.
              onClick={(e) => { if ((e.target as HTMLElement).closest("a, button")) return; onNavigate(`plan/${p.id}`); }}>
              <span className="avatar" aria-hidden="true">🗺️</span>
              <div className="meta">
                <div className="n"><a {...linkProps(`plan/${p.id}`)} className="cardlink">{p.title}</a></div>
                <div className="u">
                  {p.start_date} → {p.end_date} · ~{hours}h total · {p.sessions_per_week}× {p.minutes_per_session}min/week
                  · {p.milestone_count} milestones · {p.courses_made} courses made
                  {p.learners ? ` · ${p.learners}` : ""}
                </div>
              </div>
              {p.status === "active" ? <span className="chip on">Active</span> : <span className="chip">{p.status}</span>}
            </div>
          );
        })
      )}
    </Panel>
  );
}

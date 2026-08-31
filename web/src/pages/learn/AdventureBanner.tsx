// SPDX-License-Identifier: AGPL-3.0-or-later
// The learner's Adventure banner: world, XP, crew, unlockable chapters,
// cover art. Chapters unlock as lessons complete; bosses mark the arcs.
import { useEffect, useState } from "react";
import { api } from "../../api";

interface World {
  title: string;
  tagline: string;
  setting: string;
  characters: { name: string; role: string; description: string }[];
  chapters: { title: string; hook: string; boss: boolean }[];
}

interface Adventure {
  id: number;
  world: World;
  xp: number;
  cover_url: string | null;
  portraits?: string[];
}

export default function AdventureBanner({ courseId, lessonsDone, lessonsTotal }: {
  courseId: number;
  lessonsDone: number;
  lessonsTotal: number;
}) {
  const [adv, setAdv] = useState<Adventure | null | undefined>(undefined);

  useEffect(() => {
    api<{ adventure: Adventure | null }>(`/api/learn/adventure/${courseId}`)
      .then((d) => setAdv(d.adventure))
      .catch(() => setAdv(null));
  }, [courseId]);

  if (adv === undefined) return null;
  if (adv === null || !adv.world) return null;

  const w = adv.world;
  const chapters = w.chapters || [];
  const progress = lessonsTotal > 0 ? lessonsDone / lessonsTotal : 0;
  const unlocked = Math.max(1, Math.round(progress * chapters.length));

  return (
    <div className="adventure">
      {adv.cover_url && (
        <img className="adv-cover" src={adv.cover_url} alt="" loading="lazy" />
      )}
      <div className="adv-body">
        <div className="row wrap" style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 22, margin: 0 }}>⚔️ {w.title}</h2>
          <span className="grow" />
          <span className="adv-xp">{adv.xp} XP</span>
        </div>
        <p className="adv-tag">{w.tagline}</p>

        {chapters.length > 0 && (
          <div className="adv-chapters">
            {chapters.map((c, i) => {
              const open = i < unlocked;
              return (
                <div key={i} className={`adv-chapter${open ? " open" : ""}${c.boss ? " boss" : ""}`}>
                  <span className="adv-ch-num">{c.boss ? "☠️" : i + 1}</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="adv-ch-title">{open ? c.title : "???"}</div>
                    <div className="adv-ch-hook">{open ? c.hook : "Complete more lessons to uncover this chapter…"}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {w.characters && w.characters.length > 0 && (
          <div className="adv-crew">
            {w.characters.map((ch, i) => (
              <div key={i} className="adv-crew-card" title={ch.description}>
                {adv.portraits && adv.portraits[i] ? (
                  <img className="adv-crew-portrait" src={adv.portraits[i]} alt={ch.name} loading="lazy" />
                ) : (
                  <span className="adv-crew-avatar" aria-hidden="true">
                    {["🧭", "⚔️", "🔭", "🛠️", "🎨", "🦜"][i % 6]}
                  </span>
                )}
                <span className="adv-crew-name">{ch.name}</span>
                <span className="adv-crew-role">{ch.role}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

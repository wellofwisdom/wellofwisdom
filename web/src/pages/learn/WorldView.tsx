// SPDX-License-Identifier: AGPL-3.0-or-later
// The learner's world: the whole learning path as a journey rather than a list.
//
// Chapters run down the page as a path. Each encounter is a card that is
// locked, open, or won. A locked card says what to go and do, in words a child
// can act on, because "requires lessonsDone >= 4" helps nobody. Loot, crew and
// real rewards sit alongside, so the reason to keep going is always on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, niceError } from "../../api";
import { VideoPlayer } from "../../components/VideoUI";
import { RichText, MathText } from "../../lib/rich";
import { useReveal, useScrollProgress } from "../../lib/scrollReveal";

const BOSS_KINDS = ["boss", "miniboss"];
const isBoss = (kind: string) => BOSS_KINDS.includes(kind);

interface Encounter {
  id: number;
  chapter_index: number;
  kind: string;
  title: string;
  narration: string | null;
  art_url: string | null;
  video_upload_id: number | null;
  choices: { id: string; label: string }[];
  state: "locked" | "available" | "won";
  lockedReason: string | null;
  attempts: number;
}

interface Character {
  id: number;
  name: string;
  role: string;
  bio: string | null;
  portrait_url: string | null;
  approved: boolean;
  created_by_learner: number | null;
}

interface WorldPayload {
  adventure: { id: number; world: { title?: string; tagline?: string; setting?: string; chapters?: { title: string; hook: string }[] }; xp: number; cover_url: string | null };
  gameType: { id: string; label: string; blurb: string };
  characters: Character[];
  encounters: Encounter[];
  progress: { lessonsDone: number; correctStreak: number; xp: number } | null;
}

interface LootRow {
  id: number; name: string; description: string | null; icon: string | null;
  art_url: string | null; rarity: string; qty: number;
}

interface RewardRow {
  id: number; title: string; description: string | null; kind: string;
  url: string | null; image_url: string | null; cost_xp: number | null; status: string;
}

const KIND_ICON: Record<string, string> = {
  scene: "📖", battle: "⚔️", puzzle: "🧩", treasure: "💎",
  miniboss: "🛡️", boss: "👑", choice: "🔀",
};

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary"];

export default function WorldView({ adventureId, onNavigate }:
  { adventureId: number; onNavigate: (route: string) => void }) {
  const [data, setData] = useState<WorldPayload | null>(null);
  const [loot, setLoot] = useState<LootRow[]>([]);
  const [rewards, setRewards] = useState<RewardRow[]>([]);
  const [open, setOpen] = useState<Encounter | null>(null);
  const [bossOf, setBossOf] = useState<Encounter | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState<{ xp: number; rewards: string[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<WorldPayload>(`/api/worlds/${adventureId}`);
      setData(d);
      // A learner always gets their own pack: the server reads the session and
      // ignores this segment for them.
      const inv = await api<{ inventory: LootRow[] }>("/api/worlds/inventory/me").catch(() => ({ inventory: [] }));
      setLoot(inv.inventory);
      const rw = await api<{ rewards: RewardRow[] }>("/api/worlds/rewards/list").catch(() => ({ rewards: [] }));
      setRewards(rw.rewards);
    } catch (e) {
      setError(niceError(e));
    }
  }, [adventureId]);

  useEffect(() => { load(); }, [load]);

  // Stable so the boss fight's start effect does not re-fire on every re-render.
  const winBoss = useCallback(async () => { setBossOf(null); await load(); }, [load]);

  async function takeOn(enc: Encounter, choice?: string) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ xpGained: number; earnedRewards: { title: string }[] }>(
        `/api/worlds/encounters/${enc.id}/resolve`,
        { method: "POST", body: { outcome: "won", choice: choice || null } }
      );
      setOpen(null);
      setCelebrate({ xp: r.xpGained || 0, rewards: (r.earnedRewards || []).map((x) => x.title) });
      await load();
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <div className="formerror" role="alert">{error}</div>;
  if (!data) return <p className="muted">Opening the world…</p>;

  const world = data.adventure.world || {};
  const chapters = world.chapters || [];
  const byChapter = chapters.map((ch, i) => ({
    ...ch,
    index: i,
    encounters: data.encounters.filter((e) => e.chapter_index === i),
  }));
  const loose = data.encounters.filter((e) => e.chapter_index >= chapters.length);
  if (loose.length) byChapter.push({ title: "Onward", hook: "", index: chapters.length, encounters: loose });

  const wonCount = data.encounters.filter((e) => e.state === "won").length;

  return (
    <div className="world">
      <header
        className="worldhero"
        style={data.adventure.cover_url ? { backgroundImage: `url(${data.adventure.cover_url})` } : undefined}
      >
        <div className="worldheroin">
          <button className="btn ghost small-btn" type="button" onClick={() => onNavigate("home")}>← Back</button>
          <h1>{world.title || "Your adventure"}</h1>
          {world.tagline && <p className="tagline">{world.tagline}</p>}
          <div className="worldstats">
            <span className="wstat"><b>{data.adventure.xp}</b> XP</span>
            <span className="wstat"><b>{wonCount}</b> of {data.encounters.length} cleared</span>
            <span className="wstat">{data.gameType.label}</span>
            {data.progress && data.progress.correctStreak > 1 && (
              <span className="wstat hot">🔥 {data.progress.correctStreak} in a row</span>
            )}
          </div>
        </div>
      </header>

      {error && <div className="formerror" role="alert">{error}</div>}

      {data.encounters.length === 0 && (
        <p className="muted" style={{ marginTop: 16 }}>
          This world has no encounters yet. Ask your guide to build it out.
        </p>
      )}

      <Journey chapters={byChapter} onOpen={setOpen} />

      {loot.length > 0 && (
        <section className="worldpanel">
          <h2>Your pack</h2>
          <div className="lootstrip">
            {[...loot]
              .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity))
              .map((l) => (
                <div className={`lootchip ${l.rarity}`} key={l.id} title={l.description || l.name}>
                  <span className="looticon" aria-hidden="true">{l.icon || "🎁"}</span>
                  <span className="lootname">{l.name}</span>
                  {l.qty > 1 && <span className="lootqty">x{l.qty}</span>}
                </div>
              ))}
          </div>
        </section>
      )}

      {rewards.length > 0 && (
        <section className="worldpanel">
          <h2>Real rewards</h2>
          <div className="rewardgrid">
            {rewards.map((r) => {
              const pct = r.cost_xp ? Math.min(100, Math.round((data.adventure.xp / r.cost_xp) * 100)) : 100;
              return (
                <div className={`rewardcard ${r.status}`} key={r.id}>
                  <div className="rewardtop">
                    <span className="rewardtitle">{r.title}</span>
                    <span className={`rewardstatus ${r.status}`}>
                      {r.status === "granted" ? "yours 🎉" : r.status === "earned" ? "earned!" : `${pct}%`}
                    </span>
                  </div>
                  {r.description && <p className="muted small">{r.description}</p>}
                  {r.status === "available" && r.cost_xp && (
                    <>
                      <div className="rewardbar"><span style={{ width: `${pct}%` }} /></div>
                      <p className="muted small">{Math.max(0, r.cost_xp - data.adventure.xp)} XP to go</p>
                    </>
                  )}
                  {r.status === "earned" && (
                    <p className="muted small">Ask your guide to hand this over.</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <CrewPanel
        adventureId={adventureId}
        characters={data.characters}
        onChanged={load}
      />

      {open && (
        <EncounterDialog
          encounter={open}
          busy={busy}
          onClose={() => setOpen(null)}
          onTakeOn={takeOn}
          onFaceBoss={(e) => { setOpen(null); setBossOf(e); }}
        />
      )}

      {bossOf && (
        <BossFight
          key={bossOf.id}
          encounter={bossOf}
          onClose={() => setBossOf(null)}
          onWin={winBoss}
        />
      )}

      {celebrate && (
        <div className="celebrate" role="status" onClick={() => setCelebrate(null)}>
          <div className="celebratein">
            <div className="celeicon" aria-hidden="true">🎉</div>
            <h2>Cleared!</h2>
            <p>+{celebrate.xp} XP</p>
            {celebrate.rewards.map((t) => (
              <p key={t} className="celereward">🏆 You earned: <b>{t}</b></p>
            ))}
            <button className="btn primary" type="button" onClick={() => setCelebrate(null)}>Onward</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The chapters as a path the learner travels. The line fills as they scroll,
 *  which is the whole point: the page should feel like distance covered. */
function Journey({ chapters, onOpen }: {
  chapters: { title: string; hook: string; index: number; encounters: Encounter[] }[];
  onOpen: (e: Encounter) => void;
}) {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  return (
    <div className="chapters" ref={ref}>
      <div className="journeyline" aria-hidden="true">
        <span className="journeyfill" style={{ height: `${Math.round(progress * 100)}%` }} />
      </div>
      {chapters.map((ch) => (
        <Chapter key={ch.index} chapter={ch} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Chapter({ chapter, onOpen }: {
  chapter: { title: string; hook: string; index: number; encounters: Encounter[] };
  onOpen: (e: Encounter) => void;
}) {
  const { ref, shown } = useReveal<HTMLElement>();
  return (
    <section className={`chapter${shown ? " shown" : ""}`} ref={ref}>
      <div className="chapterhead">
        <span className="chapternum">{chapter.index + 1}</span>
        <div>
          <h2>{chapter.title}</h2>
          {chapter.hook && <p className="muted small">{chapter.hook}</p>}
        </div>
      </div>
      <div className="encounters">
        {chapter.encounters.map((e, i) => (
          <button
            key={e.id}
            type="button"
            className={`enccard ${e.state}`}
            style={{ transitionDelay: shown ? `${Math.min(i, 5) * 60}ms` : undefined }}
            onClick={() => e.state !== "locked" && onOpen(e)}
            aria-disabled={e.state === "locked"}
            title={e.state === "locked" ? e.lockedReason || "Locked" : e.title}
          >
            <span className="encicon" aria-hidden="true">
              {e.state === "locked" ? "🔒" : e.state === "won" ? "✅" : KIND_ICON[e.kind] || "✨"}
            </span>
            <span className="encbody">
              <span className="enckind">{e.kind}</span>
              <span className="enctitle">{e.title}</span>
              {e.state === "locked" && e.lockedReason && (
                <span className="encgate">{e.lockedReason}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function EncounterDialog({ encounter, busy, onClose, onTakeOn, onFaceBoss }: {
  encounter: Encounter;
  busy: boolean;
  onClose: () => void;
  onTakeOn: (e: Encounter, choice?: string) => void;
  onFaceBoss: (e: Encounter) => void;
}) {
  const won = encounter.state === "won";
  const boss = isBoss(encounter.kind);
  const choices = Array.isArray(encounter.choices) ? encounter.choices : [];
  return (
    <div className="encmodal" role="dialog" aria-modal="true" aria-label={encounter.title}>
      <div className="encmodalin">
        <div className="encmodalhead">
          <span aria-hidden="true">{KIND_ICON[encounter.kind] || "✨"}</span>
          <h2>{encounter.title}</h2>
          <button className="btn ghost small-btn" type="button" onClick={onClose}>Close</button>
        </div>

        {encounter.art_url && <img className="encart" src={encounter.art_url} alt={`Scene from ${encounter.title}`} />}
        {won && encounter.video_upload_id && (
          <VideoPlayer content={{ uploadId: encounter.video_upload_id, title: `${encounter.title} victory` }} />
        )}
        {encounter.narration && <RichText text={encounter.narration} />}

        {won ? (
          <p className="muted">You have already cleared this one.</p>
        ) : boss ? (
          <>
            <p className="muted">
              This one is a fight. Answer a run of questions correctly in a row,
              against the clock, with no hints. Miss one and the streak starts over,
              but you never lose your place.
            </p>
            <button className="btn primary big" type="button"
              onClick={() => onFaceBoss(encounter)}>
              {encounter.kind === "boss" ? "Face the boss" : "Take on the guardian"}
            </button>
          </>
        ) : choices.length > 0 ? (
          <div className="encchoices">
            {choices.map((c) => (
              <button className="btn" type="button" key={c.id} disabled={busy}
                onClick={() => onTakeOn(encounter, c.id)}>{c.label}</button>
            ))}
          </div>
        ) : (
          <button className="btn primary big" type="button" disabled={busy}
            onClick={() => onTakeOn(encounter)}>
            {busy ? "…" : "Take it on"}
          </button>
        )}
      </div>
    </div>
  );
}

interface BossQuestion {
  id: number;
  prompt: string;
  kind: string;
  choices?: { id: string; text: string }[];
}
interface BossStart { state: string; alreadyWon?: boolean; need: number; streak: number; timeLimitSec: number; question: BossQuestion | null }
interface BossAnswer {
  state: string; correct: boolean; streak: number; need: number;
  brokeBy?: string | null; timeLimitSec?: number; question?: BossQuestion | null;
  xpGained?: number; earnedRewards?: { title: string }[]; videoUploadId?: number | null;
}

/** The boss fight. A run of questions answered correctly in a row, each against
 *  a clock, with no hints. The server owns the run: which question, whether it
 *  was right, whether it was in time. This is only the arena. A miss resets the
 *  streak but never ends the fight, so it stays practice rather than a wall. */
function BossFight({ encounter, onWin, onClose }: {
  encounter: Encounter;
  onWin: () => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState<BossQuestion | null>(null);
  const [need, setNeed] = useState(5);
  const [streak, setStreak] = useState(0);
  const [limit, setLimit] = useState(30);
  const [left, setLeft] = useState(30);
  const [typed, setTyped] = useState("");
  const [verdict, setVerdict] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [victory, setVictory] = useState<{ xp: number; rewards: string[]; videoUploadId: number | null } | null>(null);
  const submitting = useRef(false);

  const submit = useCallback(async (answer: string | null) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await api<BossAnswer>(
        `/api/worlds/encounters/${encounter.id}/boss/answer`,
        { method: "POST", body: { answer } }
      );
      if (r.state === "won") {
        setVictory({
          xp: r.xpGained || 0,
          rewards: (r.earnedRewards || []).map((x) => x.title),
          videoUploadId: r.videoUploadId ?? null,
        });
        return;
      }
      setStreak(r.streak);
      setNeed(r.need);
      setVerdict(r.correct ? "Correct!" : r.brokeBy === "timeout" ? "Out of time. Streak reset." : "Not quite. Streak reset.");
      setQ(r.question || null);
      setTyped("");
      if (r.timeLimitSec) { setLimit(r.timeLimitSec); setLeft(r.timeLimitSec); }
      else setLeft(limit);
    } catch (e) {
      setError(niceError(e));
    } finally {
      setBusy(false);
      submitting.current = false;
    }
  }, [encounter.id, limit]);

  // Start the fight once, on open.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const r = await api<BossStart>(
          `/api/worlds/encounters/${encounter.id}/boss/start`,
          { method: "POST", body: {} }
        );
        if (!live) return;
        if (r.alreadyWon) { onWin(); return; }
        setNeed(r.need);
        setStreak(0);
        setLimit(r.timeLimitSec);
        setLeft(r.timeLimitSec);
        setQ(r.question);
      } catch (e) {
        if (live) setError(niceError(e));
      }
    })();
    return () => { live = false; };
  }, [encounter.id, onWin]);

  // The clock. When it runs out, an empty answer is sent: the server confirms
  // the timeout from its own clock, so this cannot be gamed by stalling.
  useEffect(() => {
    if (!q || victory || busy) return;
    if (left <= 0) { submit(null); return; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [q, left, victory, busy, submit]);

  if (victory) {
    return (
      <div className="encmodal" role="dialog" aria-modal="true" aria-label="Boss defeated">
        <div className="encmodalin">
          <div className="celeicon" aria-hidden="true">👑</div>
          <h2>{encounter.kind === "boss" ? "Boss defeated!" : "Guardian beaten!"}</h2>
          <p role="status">+{victory.xp} XP</p>
          {victory.rewards.map((t) => (
            <p key={t} className="celereward">🏆 You earned: <b>{t}</b></p>
          ))}
          {victory.videoUploadId && (
            <VideoPlayer content={{ uploadId: victory.videoUploadId, title: `${encounter.title} victory` }} />
          )}
          <button className="btn primary big" type="button" onClick={onWin}>Onward</button>
        </div>
      </div>
    );
  }

  return (
    <div className="encmodal" role="dialog" aria-modal="true" aria-label={`Boss fight: ${encounter.title}`}>
      <div className="encmodalin">
        <div className="encmodalhead">
          <span aria-hidden="true">👑</span>
          <h2>{encounter.title}</h2>
          <button className="btn ghost small-btn" type="button" onClick={onClose}>Give up</button>
        </div>

        <p className="muted small">Answer {need} in a row, no hints. A miss just resets the streak.</p>

        <div className="bossbar" role="img" aria-label={`${streak} of ${need} in a row`}>
          {Array.from({ length: need }).map((_, i) => (
            <span key={i} className={`bosspip${i < streak ? " lit" : ""}`} />
          ))}
          <span className={`bosstimer${left <= 5 ? " low" : ""}`} aria-hidden="true">{Math.max(0, left)}s</span>
        </div>

        {error && <div className="formerror" role="alert">{error}</div>}
        {verdict && <p className="bossverdict" role="status">{verdict}</p>}

        {q ? (
          <div className="bossq">
            <div className="bossprompt"><MathText text={q.prompt} /></div>
            {q.kind === "mcq" && q.choices ? (
              <div className="bosschoices">
                {q.choices.map((ch) => (
                  <button key={ch.id} className="btn" type="button" disabled={busy}
                    onClick={() => submit(ch.id)}>
                    <MathText text={ch.text} />
                  </button>
                ))}
              </div>
            ) : (
              <form className="bossnumform" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) submit(typed); }}>
                <input className="input" value={typed} inputMode="decimal" disabled={busy}
                  onChange={(e) => setTyped(e.target.value)} placeholder="Your answer"
                  aria-label="Your answer" autoFocus />
                <button className="btn primary" type="submit" disabled={busy || !typed.trim()}>Answer</button>
              </form>
            )}
          </div>
        ) : (
          <p className="muted">Summoning the boss…</p>
        )}
      </div>
    </div>
  );
}

/** The crew, and the learner's own inventions. Co-creation is the point, so
 *  adding a character is a first-class action here, not a guide-only setting. */
function CrewPanel({ adventureId, characters, onChanged }:
  { adventureId: number; characters: Character[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [role, setRole] = useState("ally");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function add() {
    setBusy(true);
    setMsg("");
    try {
      await api(`/api/worlds/${adventureId}/characters`, {
        method: "POST", body: { name, bio: bio || null, role },
      });
      setName(""); setBio(""); setAdding(false);
      setMsg("Sent to your guide. It joins the world once they say yes.");
      onChanged();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="worldpanel">
      <div className="row" style={{ alignItems: "baseline" }}>
        <h2 className="grow">The crew</h2>
        {!adding && (
          <button className="btn" type="button" onClick={() => setAdding(true)}>✍️ Invent a character</button>
        )}
      </div>

      {adding && (
        <div className="card" style={{ marginTop: 10 }}>
          <div className="field">
            <label htmlFor="ch-name">Who are they?</label>
            <input id="ch-name" className="input" value={name} maxLength={80}
              onChange={(e) => setName(e.target.value)} placeholder="Mimsy the Borogove" />
          </div>
          <div className="field">
            <label htmlFor="ch-role">What are they to you?</label>
            <select id="ch-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="ally">An ally</option>
              <option value="mentor">A mentor</option>
              <option value="rival">A rival</option>
              <option value="creature">A creature</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ch-bio">Tell us about them</label>
            <textarea id="ch-bio" className="input" rows={3} value={bio} maxLength={2000}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Where they came from, what they carry, what they are afraid of…" />
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => setAdding(false)}>Cancel</button>
            <div className="grow" />
            <button className="btn primary" type="button" disabled={busy || !name.trim()} onClick={add}>
              {busy ? "Sending…" : "Add to the world"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="small" style={{ marginTop: 8 }}>{msg}</p>}

      <div className="crewgrid">
        {characters.map((c) => (
          <div className={`crewcard${c.approved ? "" : " pending"}`} key={c.id}>
            {c.portrait_url
              ? <img src={c.portrait_url} alt={`Portrait of ${c.name}`} />
              : <div className="crewblank" aria-hidden="true">{c.name.slice(0, 1).toUpperCase()}</div>}
            <div className="crewname">{c.name}</div>
            <div className="muted small">{c.role}</div>
            {!c.approved && <div className="pendingtag">waiting for your guide</div>}
          </div>
        ))}
        {characters.length === 0 && <p className="muted small">No crew yet. Invent someone.</p>}
      </div>
    </section>
  );
}

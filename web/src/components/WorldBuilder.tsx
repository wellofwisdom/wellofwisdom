// SPDX-License-Identifier: AGPL-3.0-or-later
// The guide's side of a world: choose how it plays, build the encounters, make
// loot, set up real rewards, and approve the characters a learner invented.
//
// Two deliberate limits. Real rewards are never granted by the app: it reports
// one as earned and the guide confirms they actually handed it over. And a
// learner's character stays out of the world until a guide says yes.
import { useCallback, useEffect, useState } from "react";
import { api, niceError } from "../api";
import { Panel } from "./ui";
import { loadVideos } from "./VideoUI";
import type { UploadRow } from "./VideoUI";

interface GameType { id: string; label: string; blurb: string }

interface Encounter {
  id: number;
  chapter_index: number;
  kind: string;
  title: string;
  narration: string | null;
  art_url: string | null;
  video_upload_id: number | null;
  requires: Record<string, number>;
  rewards: { xp?: number; loot?: number[]; artPrompt?: string };
  state: string;
}

interface Character {
  id: number; name: string; role: string; bio: string | null;
  portrait_url: string | null; approved: boolean; created_by_learner: number | null;
}

interface Loot {
  id: number; name: string; description: string | null; icon: string | null;
  rarity: string; effect: Record<string, number>;
}

interface Reward {
  id: number; title: string; description: string | null; kind: string;
  url: string | null; cost_xp: number | null; status: string; learner_id: number | null;
}

const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
const REWARD_KINDS = [
  { id: "game", label: "A game (Steam, PlayStation)" },
  { id: "wishlist", label: "Something from a wishlist" },
  { id: "outing", label: "A day out" },
  { id: "screen_time", label: "Screen time" },
  { id: "money", label: "Money" },
  { id: "other", label: "Something else" },
];

export default function WorldBuilder({ adventureId, learners }:
  { adventureId: number; learners: { id: number; name: string }[] }) {
  const [gameTypes, setGameTypes] = useState<GameType[]>([]);
  const [world, setWorld] = useState<{
    adventure: { id: number; world: { title?: string } };
    gameType: GameType;
    encounters: Encounter[];
    characters: Character[];
  } | null>(null);
  const [loot, setLoot] = useState<Loot[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [videos, setVideos] = useState<UploadRow[]>([]);
  const [pick, setPick] = useState("story");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [gt, w, l, r] = await Promise.all([
        api<{ gameTypes: GameType[] }>("/api/worlds/game-types"),
        api<typeof world>(`/api/worlds/${adventureId}`),
        api<{ loot: Loot[] }>("/api/worlds/loot/all").catch(() => ({ loot: [] })),
        api<{ rewards: Reward[] }>("/api/worlds/rewards/list").catch(() => ({ rewards: [] })),
      ]);
      setGameTypes(gt.gameTypes);
      setWorld(w);
      if (w && w.gameType) setPick(w.gameType.id);
      setLoot(l.loot);
      setRewards(r.rewards);
      loadVideos().then((d) => setVideos(d.uploads)).catch(() => {});
    } catch (e) {
      setMsg(niceError(e));
    }
  }, [adventureId]);

  useEffect(() => { load(); }, [load]);

  async function build(replace: boolean) {
    if (replace && !window.confirm("Rebuild the encounters? Any edits to them are lost. Learner progress on encounters that disappear goes too.")) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ created: number }>(`/api/worlds/${adventureId}/plan`, {
        method: "POST", body: { gameType: pick, replace },
      });
      setMsg(`✅ Built ${r.created} encounters.`);
      await load();
    } catch (e) {
      setMsg(niceError(e));
    } finally {
      setBusy(false);
    }
  }

  /** Ask the AI to write the beats. Slow, so it is a job we poll. */
  async function writeStory() {
    setBusy(true);
    setMsg("Writing the story…");
    try {
      const { jobId } = await api<{ jobId: number }>(`/api/worlds/${adventureId}/beats`, { method: "POST" });
      const started = Date.now();
      const poll = async (): Promise<void> => {
        if (Date.now() - started > 4 * 60 * 1000) {
          setMsg("Still writing. It will appear when it finishes: reload in a minute.");
          setBusy(false);
          return;
        }
        const j = await api<{ job: { status: string; error: string | null; result: { written: number } | null } }>(
          `/api/courses/jobs/${jobId}`
        ).catch(() => null);
        if (!j) return void setTimeout(poll, 3000);
        if (j.job.status === "done") {
          setMsg(`✅ Wrote ${(j.job.result && j.job.result.written) || 0} beats.`);
          setBusy(false);
          await load();
          return;
        }
        if (j.job.status === "error") {
          setMsg(`Could not write it: ${j.job.error}`);
          setBusy(false);
          return;
        }
        setTimeout(poll, 3000);
      };
      setTimeout(poll, 2500);
    } catch (e) {
      setMsg(niceError(e));
      setBusy(false);
    }
  }

  /** Illustrate the encounters. Every image costs, so the count is confirmed
   *  before anything is spent. */
  async function illustrate() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api<{ jobId: number; pending: number }>(`/api/worlds/${adventureId}/art`, { method: "POST" });
      setMsg(`Drawing ${r.pending} scenes. They appear as they finish.`);
      const started = Date.now();
      const poll = async (): Promise<void> => {
        if (Date.now() - started > 8 * 60 * 1000) {
          setMsg("Still drawing. Reload in a few minutes to see them.");
          setBusy(false);
          return;
        }
        const j = await api<{ job: { status: string; error: string | null; result: { drawn: number; skipped: number } | null } }>(
          `/api/courses/jobs/${r.jobId}`
        ).catch(() => null);
        if (!j) return void setTimeout(poll, 4000);
        if (j.job.status === "done") {
          const res = j.job.result || { drawn: 0, skipped: 0 };
          setMsg(`✅ Drew ${res.drawn} scenes${res.skipped ? `, skipped ${res.skipped}` : ""}.`);
          setBusy(false);
          await load();
          return;
        }
        if (j.job.status === "error") {
          setMsg(`Could not draw them: ${j.job.error}`);
          setBusy(false);
          return;
        }
        setTimeout(poll, 4000);
      };
      setTimeout(poll, 4000);
    } catch (e) {
      setMsg(niceError(e));
      setBusy(false);
    }
  }

  async function setWinVideo(enc: Encounter, uploadId: number | null) {
    try {
      await api(`/api/worlds/encounters/${enc.id}`, { method: "PATCH", body: { videoUploadId: uploadId } });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  async function approve(c: Character) {
    try {
      await api(`/api/worlds/characters/${c.id}`, { method: "PATCH", body: { approved: true } });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  async function removeCharacter(c: Character) {
    if (!window.confirm(`Remove ${c.name} from the world?`)) return;
    try {
      await api(`/api/worlds/characters/${c.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMsg(niceError(e));
    }
  }

  if (!world) return null;

  const pending = world.characters.filter((c) => !c.approved);
  const needsArt = world.encounters.filter((e) => !e.art_url && e.rewards && e.rewards.artPrompt).length;
  const byChapter = new Map<number, Encounter[]>();
  for (const e of world.encounters) {
    const list = byChapter.get(e.chapter_index) || [];
    list.push(e);
    byChapter.set(e.chapter_index, list);
  }

  return (
    <Panel title="World builder" side={world.encounters.length ? `${world.encounters.length} encounters` : "not built yet"}>
      <div className="field">
        <label htmlFor="wb-type">How does it play?</label>
        <select id="wb-type" className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
          {gameTypes.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <div className="hint">{(gameTypes.find((g) => g.id === pick) || {}).blurb}</div>
      </div>

      <div className="row wrap">
        {world.encounters.length === 0 ? (
          <button className="btn primary" type="button" disabled={busy} onClick={() => build(false)}>
            🗺️ Build the world
          </button>
        ) : (
          <>
            <button className="btn primary" type="button" disabled={busy} onClick={writeStory}>
              ✍️ Write the story
            </button>
            <button className="btn" type="button" disabled={busy || !needsArt} onClick={illustrate}
              title={needsArt ? `${needsArt} scenes waiting to be drawn` : "Write the story first"}>
              🎨 Illustrate it{needsArt ? ` (${needsArt})` : ""}
            </button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => build(true)}>
              Rebuild with this style
            </button>
          </>
        )}
      </div>
      {world.encounters.length > 0 && (
        <p className="hint">
          Writing the story fills every encounter with prose set in this world, nodding at the real
          work behind each chapter without ever naming the subject. Run it again any time to reroll.
          Illustrating draws one picture per encounter, which costs a few cents each, so it only
          ever runs when you ask and never redraws a scene that already has art.
        </p>
      )}

      {pending.length > 0 && (
        <div className="card" style={{ marginTop: 14 }}>
          <h4 style={{ marginTop: 0 }}>Waiting for you</h4>
          <p className="muted small">A learner invented these. They stay out of the world until you say yes.</p>
          {pending.map((c) => (
            <div className="checkitem" key={c.id}>
              <span className="t">
                <b>{c.name}</b> <span className="muted">({c.role})</span>
                {c.bio && <div className="muted small">{c.bio}</div>}
              </span>
              <button className="btn small-btn" type="button" onClick={() => approve(c)}>Approve</button>
              <button className="btn ghost small-btn" type="button" onClick={() => removeCharacter(c)}>Remove</button>
            </div>
          ))}
        </div>
      )}

      {world.encounters.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4>Encounters</h4>
          {[...byChapter.entries()].map(([ci, list]) => (
            <details key={ci} open={ci === 0} style={{ marginBottom: 8 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, padding: "4px 0" }}>
                Chapter {ci + 1} ({list.length})
              </summary>
              {list.map((e) => (
                <div className="checkitem" key={e.id}>
                  <span className="t">
                    <b>{e.title}</b>
                    <span className="muted small"> · {e.kind} · {e.rewards.xp || 0} XP</span>
                    {e.requires.lessonsDone ? (
                      <div className="muted small">unlocks after {e.requires.lessonsDone} lessons</div>
                    ) : null}
                  </span>
                  <select
                    className="input"
                    style={{ maxWidth: 190 }}
                    value={e.video_upload_id || ""}
                    onChange={(ev) => setWinVideo(e, ev.target.value ? Number(ev.target.value) : null)}
                    aria-label={`Win video for ${e.title}`}
                  >
                    <option value="">No win video</option>
                    {videos.map((v) => (
                      <option key={v.id} value={v.id}>{v.title || v.original_name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </details>
          ))}
          <p className="hint">
            A win video plays when the learner clears that encounter. Upload one in the Videos panel first.
          </p>
        </div>
      )}

      <LootMaker adventureId={adventureId} loot={loot} onChanged={load} />
      <RewardMaker learners={learners} rewards={rewards} onChanged={load} />

      {msg && <p className="small" style={{ marginTop: 10 }}>{msg}</p>}
    </Panel>
  );
}

function LootMaker({ adventureId, loot, onChanged }:
  { adventureId: number; loot: Loot[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎁");
  const [rarity, setRarity] = useState("common");
  const [xpBonus, setXpBonus] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await api("/api/worlds/loot", {
        method: "POST",
        body: {
          adventureId, name, icon, rarity,
          effect: xpBonus ? { xpBonus: Number(xpBonus) } : {},
        },
      });
      setName("");
      setXpBonus("");
      onChanged();
    } catch {
      /* surfaced by the parent's next load */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 18 }}>
      <h4>Loot</h4>
      <div className="row wrap" style={{ gap: 8 }}>
        <input className="input" style={{ maxWidth: 60 }} value={icon} maxLength={4}
          onChange={(e) => setIcon(e.target.value)} aria-label="Icon" />
        <input className="input grow" value={name} maxLength={80} placeholder="Drink Me potion"
          onChange={(e) => setName(e.target.value)} aria-label="Loot name" />
        <select className="input" style={{ maxWidth: 130 }} value={rarity}
          onChange={(e) => setRarity(e.target.value)} aria-label="Rarity">
          {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 110 }} value={xpBonus} inputMode="numeric"
          placeholder="+XP" onChange={(e) => setXpBonus(e.target.value)} aria-label="XP bonus" />
        <button className="btn" type="button" disabled={busy || !name.trim()} onClick={add}>Add</button>
      </div>
      {loot.length > 0 && (
        <div className="lootstrip" style={{ marginTop: 10 }}>
          {loot.map((l) => (
            <div className={`lootchip ${l.rarity}`} key={l.id}>
              <span className="looticon">{l.icon || "🎁"}</span>
              <span className="lootname">{l.name}</span>
            </div>
          ))}
        </div>
      )}
      <p className="hint">Attach loot to an encounter by editing its rewards. XP bonuses stack on a win.</p>
    </div>
  );
}

function RewardMaker({ learners, rewards, onChanged }:
  { learners: { id: number; name: string }[]; rewards: Reward[]; onChanged: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("game");
  const [costXp, setCostXp] = useState("");
  const [url, setUrl] = useState("");
  const [learnerId, setLearnerId] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      await api("/api/worlds/rewards", {
        method: "POST",
        body: {
          title, kind, url: url || null,
          costXp: costXp ? Number(costXp) : null,
          learnerId: learnerId ? Number(learnerId) : null,
        },
      });
      setTitle("");
      setCostXp("");
      setUrl("");
      onChanged();
    } catch {
      /* surfaced by the parent's next load */
    } finally {
      setBusy(false);
    }
  }

  async function grant(r: Reward) {
    if (!window.confirm(`Mark "${r.title}" as handed over? Do this once they actually have it.`)) return;
    await api(`/api/worlds/rewards/${r.id}/grant`, { method: "POST" }).catch(() => {});
    onChanged();
  }

  async function archive(r: Reward) {
    await api(`/api/worlds/rewards/${r.id}`, { method: "DELETE" }).catch(() => {});
    onChanged();
  }

  const earned = rewards.filter((r) => r.status === "earned");

  return (
    <div style={{ marginTop: 18 }}>
      <h4>Real rewards</h4>
      <p className="muted small">
        A Steam game, something off a wishlist, a day out. The app tells you when one is earned.
        You hand it over and mark it here. It never buys anything.
      </p>

      {earned.length > 0 && (
        <div className="card" style={{ borderColor: "var(--warn, #a06a12)" }}>
          <h4 style={{ marginTop: 0 }}>Earned, waiting on you</h4>
          {earned.map((r) => (
            <div className="checkitem" key={r.id}>
              <span className="t"><b>{r.title}</b>{r.cost_xp ? <span className="muted small"> · {r.cost_xp} XP</span> : null}</span>
              <button className="btn small-btn" type="button" onClick={() => grant(r)}>Handed over</button>
            </div>
          ))}
        </div>
      )}

      <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
        <input className="input grow" value={title} maxLength={160} placeholder="Steam game of your choice"
          onChange={(e) => setTitle(e.target.value)} aria-label="Reward title" />
        <select className="input" style={{ maxWidth: 200 }} value={kind}
          onChange={(e) => setKind(e.target.value)} aria-label="Reward kind">
          {REWARD_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input className="input" style={{ maxWidth: 110 }} value={costXp} inputMode="numeric"
          placeholder="XP cost" onChange={(e) => setCostXp(e.target.value)} aria-label="XP cost" />
        <select className="input" style={{ maxWidth: 170 }} value={learnerId}
          onChange={(e) => setLearnerId(e.target.value)} aria-label="Who it is for">
          <option value="">Any learner</option>
          {learners.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input className="input grow" value={url} maxLength={600} placeholder="Link (optional)"
          onChange={(e) => setUrl(e.target.value)} aria-label="Link" />
        <button className="btn" type="button" disabled={busy || !title.trim()} onClick={add}>Add</button>
      </div>

      {rewards.filter((r) => r.status !== "earned").length > 0 && (
        <div style={{ marginTop: 10 }}>
          {rewards.filter((r) => r.status !== "earned").map((r) => (
            <div className="checkitem" key={r.id}>
              <span className="t">
                <b>{r.title}</b>
                <span className="muted small">
                  {r.cost_xp ? ` · ${r.cost_xp} XP` : ""}
                  {r.status === "granted" ? " · handed over" : ""}
                  {r.learner_id ? ` · ${(learners.find((l) => l.id === r.learner_id) || {}).name || "one learner"}` : " · any learner"}
                </span>
              </span>
              {r.status === "available" && (
                <button className="btn ghost small-btn" type="button" onClick={() => archive(r)}>Remove</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

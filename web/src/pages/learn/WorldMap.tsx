// SPDX-License-Identifier: AGPL-3.0-or-later
// WorldMap: the world as a place you move through. Replaces the flat
// encounters grid with a winding SVG trail and node buttons. Same data
// (chapters + encounters + progress) as Journey, different frame.
// Chapters become full-bleed regions; parallax hero already handled by cover.
interface EncounterForMap {
  id: number;
  kind: string;
  title: string;
  state: "locked" | "available" | "won";
  lockedReason: string | null;
}

interface ChapterForMap {
  title: string;
  hook: string;
  artUrl?: string;
  index: number;
  encounters: EncounterForMap[];
}

const KIND_ICON: Record<string, string> = {
  scene: "📖", battle: "⚔️", puzzle: "🧩", treasure: "💎",
  miniboss: "🛡️", boss: "👑", choice: "🔀",
};

export default function WorldMap({
  chapters,
  onOpen,
}: {
  chapters: ChapterForMap[];
  onOpen: (e: EncounterForMap) => void;
}) {
  const flat: (EncounterForMap & { chapterIdx: number })[] = [];
  chapters.forEach((ch) => {
    ch.encounters.forEach((e) => flat.push({ ...e, chapterIdx: ch.index }));
  });
  if (flat.length === 0) {
    return <p className="muted small">No encounters yet. Ask your guide to build the path.</p>;
  }

  const W = 360;
  const H_PER = 92;
  const H = Math.max(200, flat.length * H_PER + 60);
  const cx = W / 2;

  const points = flat.map((e, i) => {
    const y = 28 + i * H_PER;
    const x = i % 2 === 0 ? cx - 44 : cx + 44;
    return { x, y, e };
  });

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const mx = (a.x + b.x) / 2;
    const cp1x = (a.x + mx) / 2;
    const cp2x = (b.x + mx) / 2;
    const my = (a.y + b.y) / 2;
    d += ` C ${cp1x} ${my}, ${cp2x} ${my}, ${b.x} ${b.y}`;
  }

  const done = flat.filter((e) => e.state === "won").length;
  const pct = flat.length ? done / flat.length : 0;
  const nextIdx = flat.findIndex((e) => e.state === "available");
  const avatarIdx = nextIdx === -1 ? flat.length - 1 : nextIdx;
  const avatar = points[avatarIdx];

  return (
    <div className="worldmap" role="region" aria-label="World map">
      <div className="worldmap-head muted small" aria-hidden="true">
        <span>{done} of {flat.length} cleared</span>
        <span className="grow" />
        <span className="worldmap-dot" />
      </div>
      <div className="worldmap-legend muted small" aria-hidden="true">
        {Object.entries(KIND_ICON).map(([k, icon]) => {
          const n = flat.filter((x) => x.kind === k).length;
          if (!n) return null;
          return <span key={k} className="worldmap-legend-item">{icon} {n}</span>;
        })}
      </div>
      <div className="worldmap-stage">
        <svg className="worldmap-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" preserveAspectRatio="xMidYMin meet">
          <path className="worldmap-track" d={d} fill="none" stroke="var(--border)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
          <path
            className="worldmap-fill"
            d={d}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={`${pct * 2000} 2000`}
            style={{ transition: "stroke-dasharray 0.8s ease" }}
          />
        </svg>
        <div className="worldmap-nodes" style={{ height: H }}>
          {points.map(({ x, y, e }, i) => {
            const isWon = e.state === "won";
            const isNext = i === nextIdx;
            const isLocked = e.state === "locked";
            return (
              <button
                key={e.id}
                type="button"
                data-nav
                data-say={`${e.title}${isWon ? " cleared" : isLocked ? " locked" : isNext ? " next" : ""}`}
                className={`wmapnode${isWon ? " won" : ""}${isNext ? " next" : ""}${isLocked ? " locked" : ""}`}
                style={{ left: x, top: y }}
                onClick={() => e.state !== "locked" && onOpen(e as EncounterForMap)}
                aria-disabled={e.state === "locked"}
                aria-label={`${e.title}${isWon ? " (cleared)" : isNext ? " (next)" : isLocked ? ` (locked: ${e.lockedReason || "keep going"})` : ""}`}
                title={e.state === "locked" ? e.lockedReason || "Locked" : e.title}
              >
                <span className="wmapnode-dot" aria-hidden="true">
                  {isWon ? "✓" : isLocked ? "🔒" : KIND_ICON[e.kind] || "✨"}
                </span>
                <span className="wmapnode-label">
                  <span className="wmapnode-title">{e.title}</span>
                  <span className="wmapnode-kind">{e.kind}</span>
                  {isLocked && e.lockedReason && <span className="wmapnode-gate">{e.lockedReason}</span>}
                </span>
              </button>
            );
          })}
          <span className="worldmap-avatar" aria-hidden="true" style={{ left: avatar.x, top: avatar.y }}>
            <span className="worldmap-avatar-dot">●</span>
          </span>
        </div>
      </div>
      <div className="worldmap-chapters muted small" aria-hidden="true">
        {chapters.filter((c) => c.encounters.length > 0).map((c) => (
          <span key={c.index} className="worldmap-chapterchip">{c.title}</span>
        ))}
      </div>
    </div>
  );
}

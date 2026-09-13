// SPDX-License-Identifier: AGPL-3.0-or-later
// CollectionGallery: every loot item the learner has earned, plus earned
// real rewards. Lore lives here too (one sentence per item), so the
// collection feels like a set of discoveries, not a number.
// No new API: parent fetches loot + rewards already for WorldView.
interface Loot {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  art_url: string | null;
  rarity: string;
  qty: number;
}

interface Reward {
  id: number;
  title: string;
  description: string | null;
  status: string;
}

const RARITY_LABEL: Record<string, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

export default function CollectionGallery({
  loot,
  rewards,
}: {
  loot: Loot[];
  rewards: Reward[];
}) {
  if (!loot.length && !rewards.length) return null;
  return (
    <section className="collection" role="region" aria-label="Collection">
      <h2 className="collection-title">Collection</h2>
      {loot.length > 0 && (
        <div className="collection-loot">
          {loot.map((l) => (
            <div key={l.id} className={`collectcard ${l.rarity}`} title={l.description || l.name}>
              {l.art_url ? (
                <img className="collectcard-art" src={l.art_url} alt={l.name} loading="lazy" />
              ) : (
                <span className="collectcard-icon" aria-hidden="true">{l.icon || "🎁"}</span>
              )}
              <span className="collectcard-name">{l.name}</span>
              <span className="collectcard-rarity">{RARITY_LABEL[l.rarity] || l.rarity}</span>
              {l.description && <span className="collectcard-lore">{l.description}</span>}
              {l.qty > 1 && <span className="collectcard-qty">x{l.qty}</span>}
            </div>
          ))}
        </div>
      )}
      {rewards.filter((r) => r.status === "earned" || r.status === "granted").length > 0 && (
        <div className="collection-rewards">
          <h3 className="collection-subtitle">Real rewards earned</h3>
          <div className="collection-rewardlist">
            {rewards.filter((r) => r.status === "earned" || r.status === "granted").map((r) => (
              <span key={r.id} className={`collectreward ${r.status}`}>
                <span aria-hidden="true">🏆</span> {r.title}
                <span className="collectreward-status">{r.status === "granted" ? " yours" : " earned"}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

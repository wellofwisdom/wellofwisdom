-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 019: worlds. Turns an adventure from "a story wrapped round a course" into a
-- playable world: a game type, characters (AI-made AND learner-made),
-- encounters with win conditions, loot, and real-life rewards a guide sets up.
--
-- Progress is per learner, so siblings can play the same world separately.

alter table adventures add column if not exists game_type text not null default 'story';
alter table adventures add column if not exists cover_url text;
alter table adventures add column if not exists status text not null default 'active';
do $$ begin
  alter table adventures add constraint adventures_game_type_ck
    check (game_type in ('story', 'dungeon', 'rpg', 'cyoa'));
exception when duplicate_object then null; end $$;

-- Characters. `created_by_learner` is the co-creation flag: a learner can add
-- their own, and a guide approves it before it appears in the world.
create table if not exists adventure_characters (
  id bigserial primary key,
  adventure_id bigint not null references adventures(id) on delete cascade,
  family_id bigint not null references families(id) on delete cascade,
  name text not null,
  role text not null default 'ally' check (role in ('self', 'ally', 'mentor', 'rival', 'boss', 'creature')),
  bio text,
  portrait_url text,
  stats jsonb not null default '{}',
  created_by_learner bigint references users(id) on delete set null,
  approved boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists adv_characters_idx on adventure_characters (adventure_id, position);

-- An encounter is the unit of play: a scene, a fight, a choice, a treasure.
-- `requires` is what unlocks it; `rewards` is what it pays out.
create table if not exists adventure_encounters (
  id bigserial primary key,
  adventure_id bigint not null references adventures(id) on delete cascade,
  chapter_index int not null default 0,
  kind text not null default 'scene'
    check (kind in ('scene', 'battle', 'miniboss', 'boss', 'choice', 'puzzle', 'treasure')),
  title text not null,
  narration text,
  art_url text,
  video_upload_id bigint references uploads(id) on delete set null, -- the win cutscene
  requires jsonb not null default '{}',   -- {lessonsDone, correctStreak, itemId, afterEncounterId}
  rewards jsonb not null default '{}',    -- {xp, loot:[id], realRewardId}
  choices jsonb not null default '[]',    -- CYOA branches: [{id,label,goToEncounterId}]
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists adv_encounters_idx on adventure_encounters (adventure_id, chapter_index, position);

-- In-game loot.
create table if not exists loot_items (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  adventure_id bigint references adventures(id) on delete cascade,
  name text not null,
  description text,
  icon text,                  -- emoji, so loot works before any art exists
  art_url text,
  rarity text not null default 'common'
    check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  effect jsonb not null default '{}',  -- {xpBonus, hintTokens, skipToken, cosmetic}
  created_at timestamptz not null default now()
);
create index if not exists loot_family_idx on loot_items (family_id);

create table if not exists learner_inventory (
  id bigserial primary key,
  learner_id bigint not null references users(id) on delete cascade,
  loot_id bigint not null references loot_items(id) on delete cascade,
  qty int not null default 1,
  earned_at timestamptz not null default now(),
  unique (learner_id, loot_id)
);

-- Real-world rewards: a Steam game, an Amazon wishlist item, a day out. The
-- guide creates them and marks them granted; the app never buys anything.
create table if not exists real_rewards (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint references users(id) on delete cascade, -- null = any learner
  title text not null,
  description text,
  kind text not null default 'other'
    check (kind in ('game', 'wishlist', 'outing', 'screen_time', 'money', 'other')),
  url text,
  image_url text,
  cost_xp int,
  requires jsonb not null default '{}',  -- {courseId, planId, badge, encounterId}
  status text not null default 'available'
    check (status in ('available', 'earned', 'granted', 'archived')),
  earned_at timestamptz,
  granted_at timestamptz,
  granted_by bigint references users(id) on delete set null,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists real_rewards_family_idx on real_rewards (family_id, status);

create table if not exists encounter_progress (
  id bigserial primary key,
  learner_id bigint not null references users(id) on delete cascade,
  encounter_id bigint not null references adventure_encounters(id) on delete cascade,
  state text not null default 'available'
    check (state in ('locked', 'available', 'in_progress', 'won', 'skipped')),
  attempts int not null default 0,
  choice_taken text,
  won_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (learner_id, encounter_id)
);
create index if not exists encounter_progress_idx on encounter_progress (learner_id, state);

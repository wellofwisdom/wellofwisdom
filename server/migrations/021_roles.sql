-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 021: more than one grown-up per family.
--
-- Until now a family had "parents" and "learners" and every parent could do
-- everything. That cannot express two parents, a hired tutor who should see
-- one child, or a grandparent who should see progress and change nothing.
--
-- Backfill is deliberately generous: every existing parent becomes an owner.
-- Nobody who could do something yesterday loses it today.

alter table users add column if not exists guide_role text;
do $$ begin
  alter table users add constraint users_guide_role_ck
    check (guide_role is null or guide_role in ('owner', 'guide', 'assistant', 'observer'));
exception when duplicate_object then null; end $$;

update users set guide_role = 'owner' where role = 'parent' and guide_role is null;

-- An assistant sees only the learners they are assigned. Empty means none,
-- which is why assistant is never the default for anything.
create table if not exists guide_learners (
  guide_id bigint not null references users(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  primary key (guide_id, learner_id)
);

-- Invites replace handing round a join code that never rotates.
create table if not exists invites (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  token_hash text not null unique,
  guide_role text not null default 'guide'
    check (guide_role in ('guide', 'assistant', 'observer')),
  learner_ids bigint[] not null default '{}',
  note text,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by bigint references users(id) on delete set null,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists invites_family_idx on invites (family_id, created_at desc);

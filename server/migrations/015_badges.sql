-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 015: gamification completion — badges (auto-awarded from real work) and
-- streak state. Streaks derive from attempt dates; badges are persistent.

create table if not exists badges (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  badge text not null,
  earned_at timestamptz not null default now(),
  unique (learner_id, badge)
);
create index if not exists badges_learner_idx on badges (learner_id);

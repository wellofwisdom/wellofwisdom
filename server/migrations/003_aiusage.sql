-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 003: AI usage accounting per family (architecture promise: from the day AI
-- calls start). Fail-open: logging problems never break AI features.

create table if not exists ai_usage (
  id bigserial primary key,
  family_id bigint references families(id) on delete cascade,
  task text not null,
  model text,
  tokens_in int,
  tokens_out int,
  cost numeric(10, 6),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_family_idx on ai_usage (family_id, created_at);

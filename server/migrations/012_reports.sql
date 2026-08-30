-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 012: progress reports. Stats computed from real work (attempts,
-- completions); narrative AI-drafted and guide-editable; printable.

create table if not exists reports (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  title text not null,
  stats jsonb not null default '{}',
  narrative text not null default '',
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reports_family_idx on reports (family_id, learner_id);

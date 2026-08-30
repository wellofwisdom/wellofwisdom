-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 009: email layer. Family preferences (digest on/off, override address) and
-- a send log (also dedupes the weekly digest per family per week).

alter table families add column if not exists prefs jsonb not null default '{}';

create table if not exists mail_log (
  id bigserial primary key,
  family_id bigint references families(id) on delete cascade,
  kind text not null,
  to_email text not null,
  subject text,
  provider text,
  status text not null check (status in ('sent', 'error')),
  error text,
  created_at timestamptz not null default now()
);
create index if not exists mail_log_family_idx on mail_log (family_id, created_at);

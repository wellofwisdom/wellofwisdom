-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 040: API tokens for MCP and integrations (Well 12).

create table if not exists api_tokens (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists api_tokens_family_idx on api_tokens (family_id);
create index if not exists api_tokens_user_idx on api_tokens (user_id);

-- No index on token_hash: the unique constraint above already keeps one
-- (042 drops the redundant index an earlier revision of this file created).

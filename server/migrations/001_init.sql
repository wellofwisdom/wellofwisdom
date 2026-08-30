-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 001: families, users (parents + learners), sessions.

create table if not exists families (
  id bigserial primary key,
  name text not null,
  join_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  role text not null check (role in ('parent', 'learner')),
  name text not null,
  -- parents
  email text unique,
  password_hash text,
  -- learners
  username text,
  pin_hash text,
  grade_level int,
  interests text[] not null default '{}',
  reading_level text,
  prefs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  -- learner usernames are unique within a family (nulls allowed for parents)
  constraint users_family_username unique (family_id, username)
);

create index if not exists users_family_idx on users (family_id);

create table if not exists sessions (
  token_hash text primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists sessions_user_idx on sessions (user_id);

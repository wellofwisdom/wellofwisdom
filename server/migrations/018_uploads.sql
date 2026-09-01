-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 018: uploaded media. Files live on disk under UPLOAD_DIR (a persistent
-- volume); this table is the index, the permission record, and the only thing
-- that maps a public id to a path on disk. A storage_key is never taken from
-- the client. It is generated here and resolved through a safe join.

create table if not exists uploads (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  kind text not null check (kind in ('video', 'image', 'audio')),
  mime text not null,
  bytes bigint not null,
  storage_key text not null unique,
  original_name text,
  title text,
  duration_sec int,
  poster_url text,
  -- A file is private to its family unless it is deliberately attached to
  -- something public (a course trailer on a published course).
  is_public boolean not null default false,
  meta jsonb not null default '{}',
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists uploads_family_idx on uploads (family_id, created_at desc);
create index if not exists uploads_kind_idx on uploads (family_id, kind);

-- A short video that introduces a course. The thing you would put at the top
-- of a shared course page.
alter table courses add column if not exists trailer_upload_id bigint
  references uploads(id) on delete set null;

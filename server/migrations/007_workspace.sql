-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 007: workspace pages — the free-form layer (notes, links, records,
-- anything). Nested like a wiki, one editor, family-scoped.

create table if not exists workspace_pages (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  parent_id bigint references workspace_pages(id) on delete cascade,
  title text not null default 'Untitled',
  icon text,
  body text not null default '',
  position int not null default 0,
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_pages_family_idx on workspace_pages (family_id);
create index if not exists workspace_pages_parent_idx on workspace_pages (parent_id);

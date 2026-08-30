-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 008: resource library — links, videos, books, tools, places. Notion-style
-- database: one collection, many views (table/board/calendar/gallery).

create table if not exists resources (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  title text not null,
  url text,
  type text not null default 'link' check (type in ('link', 'video', 'book', 'tool', 'place', 'note')),
  subject text,
  status text not null default 'inbox' check (status in ('inbox', 'queued', 'in_use', 'done')),
  rating int not null default 0 check (rating between 0 and 5),
  date_for date,
  notes text,
  course_id bigint references courses(id) on delete set null,
  plan_id bigint references term_plans(id) on delete set null,
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resources_family_idx on resources (family_id);

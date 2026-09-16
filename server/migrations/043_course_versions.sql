-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 043: course version snapshots. One jsonb tree per save, last 20 per course.

create table if not exists course_versions (
  id bigserial primary key,
  course_id bigint not null references courses(id) on delete cascade,
  family_id bigint not null references families(id) on delete cascade,
  snapshot jsonb not null,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists course_versions_course_idx on course_versions (course_id, created_at desc);
create index if not exists course_versions_family_idx on course_versions (family_id);

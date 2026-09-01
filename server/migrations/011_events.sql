-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 011: calendar events, sessions, deadlines, field trips, exams. Powers the
-- calendar view and tomorrow-reminder emails (Trinacle appointment pattern).

create table if not exists events (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  title text not null,
  description text,
  on_date date not null,
  at_time text,
  kind text not null default 'other' check (kind in ('session', 'deadline', 'field_trip', 'exam', 'other')),
  plan_id bigint references term_plans(id) on delete set null,
  course_id bigint references courses(id) on delete set null,
  notified_at timestamptz,
  created_by bigint not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists events_family_date_idx on events (family_id, on_date);

-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 006: learning paths (curricula). A plan spans a term or year; milestones
-- are the waypoints; courses are generated just-in-time per milestone and
-- linked back. Per-learner personalization lives on enrollments.

create table if not exists term_plans (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  title text not null,
  subject text not null,
  goal text,
  start_date date not null,
  end_date date not null,
  sessions_per_week int not null default 3,
  minutes_per_session int not null default 30,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists term_plans_family_idx on term_plans (family_id);

create table if not exists plan_enrollments (
  id bigserial primary key,
  plan_id bigint not null references term_plans(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  lens_override text,
  personal_note text,
  unique (plan_id, learner_id)
);

create table if not exists plan_milestones (
  id bigserial primary key,
  plan_id bigint not null references term_plans(id) on delete cascade,
  title text not null,
  description text,
  position int not null default 0,
  target_date date,
  course_id bigint references courses(id) on delete set null,
  project_ideas jsonb not null default '[]',
  resources jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists plan_milestones_plan_idx on plan_milestones (plan_id);

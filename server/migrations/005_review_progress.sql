-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 005: spaced review scheduling + lesson completion log (progress feature).

create table if not exists review_schedule (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  item_id bigint not null references lesson_items(id) on delete cascade,
  ease numeric(4, 2) not null default 2.5,
  interval_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, item_id)
);
create index if not exists review_due_idx on review_schedule (learner_id, due_at);

create table if not exists lesson_completions (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  course_id bigint not null references courses(id) on delete cascade,
  lesson_id bigint not null references lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (learner_id, lesson_id)
);

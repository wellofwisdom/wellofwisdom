-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 002: courses, units, lessons, lesson_items, attempts, jobs.

create table if not exists courses (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint references users(id) on delete set null, -- null = whole family
  title text not null,
  topic text not null,
  lens text,
  grade_level int,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  description text,
  sources jsonb not null default '[]',
  created_by bigint not null references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists courses_family_idx on courses (family_id);

create table if not exists units (
  id bigserial primary key,
  course_id bigint not null references courses(id) on delete cascade,
  title text not null,
  position int not null default 0
);
create index if not exists units_course_idx on units (course_id);

create table if not exists lessons (
  id bigserial primary key,
  unit_id bigint not null references units(id) on delete cascade,
  title text not null,
  summary text,
  position int not null default 0
);
create index if not exists lessons_unit_idx on lessons (unit_id);

-- item.content shapes:
--   article:  { title, body }                      body: paragraphs, **bold**, - lists, $math$
--   exercise: { prompt, kind: mcq|numeric|text, choices[], answer, explanation, hint }
--              mcq answer = choice id; numeric = number (+tolerance); text = model answer (self-check)
--   video:    { youtubeId, title, note, questions[] } questions = mini mcqs shown after the video
--   project:  { title, description, rubric }
create table if not exists lesson_items (
  id bigserial primary key,
  lesson_id bigint not null references lessons(id) on delete cascade,
  type text not null check (type in ('article','exercise','video','project')),
  position int not null default 0,
  content jsonb not null default '{}'
);
create index if not exists items_lesson_idx on lesson_items (lesson_id);

create table if not exists attempts (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  item_id bigint not null references lesson_items(id) on delete cascade,
  question_index int not null default 0, -- for video sub-questions
  correct boolean, -- null = self-check (text exercises)
  answer jsonb,
  created_at timestamptz not null default now()
);
create index if not exists attempts_learner_idx on attempts (learner_id, item_id);

create table if not exists jobs (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  type text not null,
  status text not null default 'queued' check (status in ('queued','running','done','error')),
  payload jsonb not null default '{}',
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists jobs_status_idx on jobs (status);

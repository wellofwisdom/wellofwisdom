-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 013: gamification + AI media. Adventures wrap a course in a story built
-- from a theme template + learner interests; media_assets stores generated
-- images/videos; courses get a cover image.

alter table courses add column if not exists cover_url text;

create table if not exists media_assets (
  id bigserial primary key,
  family_id bigint references families(id) on delete cascade,
  kind text not null check (kind in ('image', 'video')),
  purpose text not null,           -- course-cover | adventure-art | character-portrait | cutscene | resource
  ref_type text not null,          -- course | adventure | plan | lesson
  ref_id bigint,
  url text not null,
  provider text,
  model text,
  prompt text,
  meta jsonb not null default '{}',
  created_by bigint references users(id),
  created_at timestamptz not null default now()
);
create index if not exists media_ref_idx on media_assets (ref_type, ref_id, purpose);

create table if not exists adventures (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint references users(id) on delete cascade,
  course_id bigint not null references courses(id) on delete cascade,
  theme_id text not null,
  world jsonb not null default '{}', -- {title, tagline, setting, characters[], chapters[], coverPrompt}
  xp int not null default 0,
  state jsonb not null default '{}',
  created_by bigint not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists adventures_course_idx on adventures (course_id, learner_id);

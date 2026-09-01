-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 020: the Socratic tutor. A learner can ask for help and get walked toward
-- the idea rather than handed the answer.
--
-- Every conversation is stored in full and is visible to the guide. That is
-- not a feature toggle: a child talking to an AI in a house that trusts this
-- app must leave a record their parent can read.

create table if not exists tutor_threads (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  lesson_id bigint references lessons(id) on delete set null,
  item_id bigint references lesson_items(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tutor_threads_learner_idx on tutor_threads (learner_id, updated_at desc);
create index if not exists tutor_threads_family_idx on tutor_threads (family_id, updated_at desc);

create table if not exists tutor_messages (
  id bigserial primary key,
  thread_id bigint not null references tutor_threads(id) on delete cascade,
  role text not null check (role in ('learner', 'tutor')),
  content text not null,
  -- Set when the guardrail refused, so a guide can see what was asked.
  refused boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tutor_messages_thread_idx on tutor_messages (thread_id, created_at);

-- How much the tutor gives away, per learner. hints: never states the answer.
-- guided: works through the method. full: may explain the answer outright.
alter table users add column if not exists tutor_mode text not null default 'hints';
do $$ begin
  alter table users add constraint users_tutor_mode_ck
    check (tutor_mode in ('hints', 'guided', 'full'));
exception when duplicate_object then null; end $$;

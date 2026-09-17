-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 045: per-card flashcard review schedule so each card in a deck is tracked
-- separately. The existing review_schedule for exercises stays untouched.

create table if not exists flashcard_reviews (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  item_id bigint not null references lesson_items(id) on delete cascade,
  card_index int not null check (card_index >= 0),
  ease numeric(4, 2) not null default 2.5,
  interval_days int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  due_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, item_id, card_index)
);
create index if not exists flashcard_due_idx on flashcard_reviews (learner_id, due_at);
create index if not exists flashcard_item_idx on flashcard_reviews (item_id);

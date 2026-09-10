-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 024: submitted work. A project item has always been a brief a learner reads
-- and nothing more: there was no way to hand anything in, and no way for a
-- guide to answer it. This is the other half.
--
-- One row per learner per item, revised in place, because a project is a thing
-- you keep working on rather than a stream of attempts. The lifecycle:
--   draft      the learner is still writing. Only they see it.
--   submitted  handed in. The learner can no longer edit it.
--   returned   the guide has answered. The learner may revise and hand it in
--              again, which puts it back to submitted with the old feedback
--              still on screen until it is replaced.
--
-- ai_feedback is the AI's DRAFT and it is never shown to a learner: it fills
-- the guide's editor, and only `feedback`, which the guide wrote or approved,
-- crosses back. That separation is the whole point of the feature, so the
-- learner projection in routes/learn.js must never select this column.
create table if not exists submissions (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  item_id bigint not null references lesson_items(id) on delete cascade,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'submitted', 'returned')),
  submitted_at timestamptz,
  ai_feedback jsonb,
  ai_at timestamptz,
  feedback text,
  outcome text check (outcome in ('not_yet', 'nearly', 'met', 'exceptional')),
  graded_by bigint references users(id) on delete set null,
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, item_id)
);
create index if not exists submissions_family_idx on submissions (family_id, status);
create index if not exists submissions_item_idx on submissions (item_id);

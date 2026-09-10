-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 026: assessments, the third piece of the compliance pack.
--
-- The states that ask a homeschool family for anything ask for attendance, a
-- portfolio, or an assessment: a standardised test result, or a written
-- evaluation by a teacher. Attendance and the portfolio are built from work the
-- app already holds. An assessment is not: it is a record the family gets from
-- somewhere else, so the guide types it in and this table keeps it.
--
-- What this table will NOT hold is a verdict. There is no pass column and no
-- threshold. Which score is "enough" is a question about the law of one place
-- and the facts of one family, and the app records the result rather than
-- judging it (see lib/assessments.js and its test).
--
-- scores is a list of { area, score, percentile } rows. The score is text on
-- purpose: scaled scores, stanines, grade equivalents and "Satisfactory" are all
-- real answers, and forcing them into a number would lose what the report said.
-- percentile is the one number nearly every norm-referenced report shares, so it
-- is the one the normalizer bounds (1 to 99).
create table if not exists assessments (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  taken_on date not null,
  kind text not null default 'test' check (kind in ('test', 'evaluation', 'other')),
  title text not null check (length(title) between 1 and 160),
  given_by text,
  grade_level int check (grade_level is null or (grade_level >= 1 and grade_level <= 14)),
  scores jsonb not null default '[]'::jsonb,
  summary text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists assessments_learner_idx on assessments (learner_id, taken_on);

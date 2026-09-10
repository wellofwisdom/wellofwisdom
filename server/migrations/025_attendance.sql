-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 025: attendance, the first piece of the compliance pack.
--
-- Roughly half of US states ask a homeschool family to file something, and the
-- thing they ask for most often is days of instruction. That number is already
-- implicit in the database: a day a learner answered something, finished a
-- lesson or handed work in is a day of instruction. So attendance is DERIVED by
-- default and this table holds only the guide's decisions on top of it:
--
--   counted = true   a day the guide is claiming that the app did not see. A
--                    museum trip, a day of reading on the sofa, a co-op class.
--   counted = false  a day the app counted that the guide is excluding. Five
--                    minutes of review on a Sunday is not a school day.
--
-- Storing only the overrides means the log cannot drift away from the work: fix
-- a learner's attempts and the days follow, without a rebuild.
--
-- minutes is optional because some states count hours instead of days, and a
-- family that does not need hours should never have to type them.
create table if not exists attendance_days (
  id bigserial primary key,
  family_id bigint not null references families(id) on delete cascade,
  learner_id bigint not null references users(id) on delete cascade,
  day date not null,
  counted boolean not null default true,
  minutes int check (minutes is null or (minutes >= 0 and minutes <= 1440)),
  note text,
  created_by bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (learner_id, day)
);
create index if not exists attendance_family_idx on attendance_days (family_id, day);

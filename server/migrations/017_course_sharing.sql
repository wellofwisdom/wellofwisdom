-- SPDX-License-Identifier: AGPL-3.0-or-later
-- 017: course sharing. A course can be published to a public, read-only page
-- on this instance (/c/<slug>) and downloaded as a portable .wow-course.json.
-- No central platform: every instance publishes its own, and any instance can
-- import from any other instance's URL. Forks inherit the whole mechanism.

alter table courses add column if not exists public_slug text;
alter table courses add column if not exists published_at timestamptz;
alter table courses add column if not exists license text;
alter table courses add column if not exists author_name text;
-- Whether the downloadable package carries answer keys. Browse pages never do.
alter table courses add column if not exists share_answers boolean not null default true;

create unique index if not exists courses_public_slug_idx on courses (public_slug)
  where public_slug is not null;
create index if not exists courses_published_idx on courses (published_at desc)
  where published_at is not null;
